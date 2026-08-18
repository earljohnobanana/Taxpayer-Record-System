import { Router } from "express";
import ExcelJS from "exceljs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../database/db.js";
import {
  barangays,
  owners,
  establishments,
  taxRecords,
  payments,
  paymentItems,
} from "../database/schema.js";
import { computePaymentStatus } from "../services/paymentStatus.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();
router.use(authenticate);
router.use(requirePermission("reports:read"));

async function buildWorkbook(title, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title);
  ws.columns = columns;
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  return wb;
}

/* ── Business Permit Collection report (dynamic columns) ──
   Fixed columns: Date Paid, Period Covered, OR Number, Establishment,
   Business Type, then ONE column per distinct item label that actually appears
   in the exported payments (ordered by category), then Total and Remarks.
   Each row fills only the items it has; the rest are left blank. */
const CATEGORY_ORDER = { business_tax: 0, mayors_permit: 1, regulatory: 2 };

function buildPermitCollectionWorkbook(rows, year) {
  // Determine the dynamic item columns present across all rows.
  const seen = new Map(); // label -> { label, category }
  for (const r of rows) {
    for (const it of r.items || []) {
      if (!seen.has(it.label)) seen.set(it.label, { label: it.label, category: it.category });
    }
  }
  const itemCols = [...seen.values()].sort((a, b) => {
    const ca = CATEGORY_ORDER[a.category] ?? 9;
    const cb = CATEGORY_ORDER[b.category] ?? 9;
    if (ca !== cb) return ca - cb;
    return a.label.localeCompare(b.label);
  });

  const fixedLead = ["Date Paid", "Period Covered", "OR Number", "Establishment", "Business Type"];
  const headers = [...fixedLead, ...itemCols.map((c) => c.label), "Total", "Remarks"];
  const lastCol = headers.length;
  const firstItemCol = fixedLead.length + 1; // 1-based column index of first item column
  const totalColIdx = firstItemCol + itemCols.length;
  const remarksColIdx = totalColIdx + 1;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Business Permit Collection");

  // Title block
  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Municipality of Santa Catalina, Negros Oriental";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center" };

  ws.mergeCells(2, 1, 2, lastCol);
  const subCell = ws.getCell(2, 1);
  subCell.value = year
    ? `Business Permit Collection Report — ${year}`
    : "Business Permit Collection Report";
  subCell.font = { italic: true, size: 11 };
  subCell.alignment = { horizontal: "center" };

  // Header row (row 4)
  const headerRowIdx = 4;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.values = headers;
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", wrapText: true };

  // Column widths
  ws.getColumn(1).width = 13; // Date
  ws.getColumn(2).width = 13; // Period
  ws.getColumn(3).width = 16; // OR
  ws.getColumn(4).width = 28; // Establishment
  ws.getColumn(5).width = 18; // Business Type
  itemCols.forEach((_, i) => (ws.getColumn(firstItemCol + i).width = 14));
  ws.getColumn(totalColIdx).width = 14;
  ws.getColumn(remarksColIdx).width = 24;

  // Data rows
  const colTotals = itemCols.map(() => 0);
  let grandTotal = 0;

  rows.forEach((r, i) => {
    // Sum each item label for this payment (usually one item per label).
    const byLabel = {};
    for (const it of r.items || []) {
      byLabel[it.label] = (byLabel[it.label] || 0) + Number(it.amount || 0);
    }
    const rowTotal = Object.values(byLabel).reduce((s, n) => s + n, 0);
    grandTotal += rowTotal;

    const itemValues = itemCols.map((c, idx) => {
      const v = byLabel[c.label];
      if (v) colTotals[idx] += v;
      return v ? v : null; // blank when this payment doesn't have the item
    });

    ws.getRow(headerRowIdx + 1 + i).values = [
      r.paymentDate,
      r.taxYear,
      r.orNumber,
      r.establishmentName,
      r.businessType,
      ...itemValues,
      rowTotal,
      r.remarks || "",
    ];
  });

  // Totals row
  const totalsRowIdx = headerRowIdx + 1 + rows.length;
  const totalsRow = ws.getRow(totalsRowIdx);
  const totalsValues = new Array(lastCol).fill(null);
  totalsValues[4] = "TOTAL"; // under Business Type
  itemCols.forEach((_, idx) => (totalsValues[firstItemCol - 1 + idx] = colTotals[idx]));
  totalsValues[totalColIdx - 1] = grandTotal;
  totalsRow.values = totalsValues;
  totalsRow.font = { bold: true };

  // Currency format for item columns + Total (not Remarks).
  for (let col = firstItemCol; col <= totalColIdx; col++) {
    for (let r = headerRowIdx + 1; r <= totalsRowIdx; r++) {
      ws.getCell(r, col).numFmt = "#,##0.00";
    }
  }

  return wb;
}

/* Parses a comma-separated list of barangay IDs from a query param.
   Returns null when absent/empty, meaning "no filter — include all". */
function parseBarangayIds(raw) {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

router.get("/:type", async (req, res) => {
  const { type } = req.params;
  const year = req.query.year ? Number(req.query.year) : null;
  const barangayFilter = parseBarangayIds(req.query.barangayIds);
  const dateFrom = req.query.dateFrom || null; // "YYYY-MM-DD"
  const dateTo = req.query.dateTo || null;     // "YYYY-MM-DD"

  let wb;
  switch (type) {
    case "barangay-summary": {
      const rows = await db.select().from(barangays);
      wb = await buildWorkbook(
        "Barangay Summary",
        [
          { header: "ID", key: "id", width: 8 },
          { header: "Name", key: "name", width: 30 },
          { header: "Archived", key: "archived", width: 12 },
        ],
        rows.map((r) => ({ id: r.id, name: r.name, archived: r.isArchived ? "Yes" : "No" }))
      );
      break;
    }
    case "owner-list": {
      const rows = await db.select().from(owners);
      wb = await buildWorkbook(
        "Owner List",
        [
          { header: "Full Name", key: "fullName", width: 30 },
          { header: "Address", key: "address", width: 40 },
          { header: "Contact", key: "contact", width: 18 },
          { header: "TIN", key: "tin", width: 18 },
        ],
        rows.map((r) => ({
          fullName: r.fullName,
          address: r.address,
          contact: r.contactNumber,
          tin: r.tin,
        }))
      );
      break;
    }
    case "establishment-list": {
      const rows = await db
        .select({
          name: establishments.name,
          businessType: establishments.businessType,
          address: establishments.address,
          status: establishments.status,
          barangay: barangays.name,
          owner: owners.fullName,
        })
        .from(establishments)
        .innerJoin(barangays, eq(establishments.barangayId, barangays.id))
        .innerJoin(owners, eq(establishments.ownerId, owners.id));
      wb = await buildWorkbook(
        "Establishments",
        [
          { header: "Name", key: "name", width: 28 },
          { header: "Barangay", key: "barangay", width: 22 },
          { header: "Owner", key: "owner", width: 28 },
          { header: "Type", key: "businessType", width: 18 },
          { header: "Status", key: "status", width: 12 },
        ],
        rows
      );
      break;
    }
    case "outstanding-balances": {
      // Establishment lookup map, so we can filter by barangay and
      // attach establishment name without a query per tax record.
      const estRows = await db
        .select({
          id: establishments.id,
          name: establishments.name,
          barangayId: establishments.barangayId,
        })
        .from(establishments);
      const estById = new Map(estRows.map((e) => [e.id, e]));

      const allTax = await db.select().from(taxRecords);
      const data = [];
      for (const tr of allTax) {
        if (year && tr.taxYear !== year) continue;

        const est = estById.get(tr.establishmentId);
        if (barangayFilter && (!est || !barangayFilter.has(est.barangayId))) continue;

        const pRows = await db
          .select()
          .from(payments)
          .where(eq(payments.taxRecordId, tr.id));
        const { balance, status } = computePaymentStatus({
          taxDue: tr.taxDue,
          paymentSchedule: tr.paymentSchedule,
          payments: pRows,
        });
        if (balance <= 0) continue;

        data.push({
          year: tr.taxYear,
          establishment: est?.name,
          taxDue: tr.taxDue,
          balance,
          status,
        });
      }
      wb = await buildWorkbook(
        "Outstanding Balances",
        [
          { header: "Year", key: "year", width: 10 },
          { header: "Establishment", key: "establishment", width: 30 },
          { header: "Tax Due", key: "taxDue", width: 14 },
          { header: "Balance", key: "balance", width: 14 },
          { header: "Status", key: "status", width: 16 },
        ],
        data
      );
      break;
    }
    case "payment-detail": {
      // Business permit collection ledger — one row per payment. The fee
      // columns are dynamic: only item types that actually appear become
      // columns. Filterable by barangay(s) and payment date range.
      const rows = await db
        .select({
          id: payments.id,
          paymentDate: payments.paymentDate,
          orNumber: payments.orNumber,
          remarks: payments.remarks,
          taxYear: taxRecords.taxYear,
          establishmentName: establishments.name,
          businessType: establishments.businessType,
          barangayId: establishments.barangayId,
        })
        .from(payments)
        .innerJoin(taxRecords, eq(payments.taxRecordId, taxRecords.id))
        .innerJoin(establishments, eq(taxRecords.establishmentId, establishments.id));

      const filtered = rows.filter((r) => {
        if (barangayFilter && !barangayFilter.has(r.barangayId)) return false;
        if (dateFrom && r.paymentDate < dateFrom) return false;
        if (dateTo && r.paymentDate > dateTo) return false;
        return true;
      });
      filtered.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

      // Attach the itemized breakdown for each payment.
      const ids = filtered.map((r) => r.id);
      const items = ids.length
        ? await db.select().from(paymentItems).where(inArray(paymentItems.paymentId, ids))
        : [];
      const byPayment = new Map();
      for (const it of items) {
        if (!byPayment.has(it.paymentId)) byPayment.set(it.paymentId, []);
        byPayment.get(it.paymentId).push(it);
      }
      filtered.forEach((r) => (r.items = byPayment.get(r.id) || []));

      wb = buildPermitCollectionWorkbook(filtered, year);
      break;
    }
    default:
      return res.status(400).json({ message: "Unknown report type" });
  }

  await logActivity({
    userId: req.user.id,
    action: "Excel Generated",
    module: "Reports",
    details: type,
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${type}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default router;