import { Router } from "express";
import { eq, inArray, or, like, desc, sql, count } from "drizzle-orm";
import { db } from "../database/db.js";
import {
  payments,
  paymentItems,
  feeOptions,
  taxRecords,
  establishments,
  owners,
  users,
} from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";

const router = Router();
router.use(authenticate);

const CATEGORIES = ["business_tax", "mayors_permit", "regulatory"];

/* Validate and normalize the incoming items[] payload.
   Each item: { category, label, amount }. Drops blanks/zero, returns
   { items, total } or throws a message string. */
function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) throw "Items are required.";
  const items = [];
  let total = 0;
  for (const it of rawItems) {
    const amount = Number(it?.amount);
    const label = (it?.label || "").trim();
    const category = it?.category;
    if (!label || !CATEGORIES.includes(category)) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    items.push({ category, label, amount });
    total += amount;
  }
  if (items.length === 0) throw "Add at least one charge with an amount greater than zero.";
  return { items, total };
}

/* Reserved item labels that are recorded as line items (and appear on reports)
   but must NOT be added to the selectable fee_options catalog — they have their
   own dedicated input in the UI (e.g. the standalone Penalty checkbox). */
const RESERVED_LABELS = new Set(["penalty"]);

/* Make sure each item's label exists in the fee_options catalog, so custom
   entries typed by staff are remembered for next time. */
async function ensureOptionsExist(items) {
  const existing = await db.select().from(feeOptions);
  const has = (cat, label) =>
    existing.some(
      (o) => o.category === cat && o.label.toLowerCase() === label.toLowerCase()
    );
  const toAdd = [];
  const seen = new Set();
  for (const it of items) {
    if (RESERVED_LABELS.has(it.label.toLowerCase())) continue; // never catalog reserved labels
    const key = `${it.category}::${it.label.toLowerCase()}`;
    if (!has(it.category, it.label) && !seen.has(key)) {
      seen.add(key);
      toAdd.push({ category: it.category, label: it.label, sortOrder: 999 });
    }
  }
  if (toAdd.length) await db.insert(feeOptions).values(toAdd);
}

/* Attach an `items` array to each payment row. */
async function attachItems(paymentRows) {
  if (paymentRows.length === 0) return paymentRows;
  const ids = paymentRows.map((p) => p.id);
  const items = await db
    .select()
    .from(paymentItems)
    .where(inArray(paymentItems.paymentId, ids));
  const byPayment = new Map();
  for (const it of items) {
    if (!byPayment.has(it.paymentId)) byPayment.set(it.paymentId, []);
    byPayment.get(it.paymentId).push({
      category: it.category,
      label: it.label,
      amount: it.amount,
    });
  }
  return paymentRows.map((p) => ({ ...p, items: byPayment.get(p.id) || [] }));
}

router.get("/", requirePermission("payments:read"), async (req, res) => {
  const search = req.query.search?.trim()?.toLowerCase();
  const { page, pageSize, limit, offset } = parsePagination(req.query);

  const whereClause = search
    ? or(
        like(sql`lower(${payments.orNumber})`, `%${search}%`),
        like(sql`lower(${establishments.name})`, `%${search}%`),
        like(sql`lower(${owners.fullName})`, `%${search}%`)
      )
    : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(payments)
    .innerJoin(taxRecords, eq(payments.taxRecordId, taxRecords.id))
    .innerJoin(establishments, eq(taxRecords.establishmentId, establishments.id))
    .innerJoin(owners, eq(establishments.ownerId, owners.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: payments.id,
      taxRecordId: payments.taxRecordId,
      paymentDate: payments.paymentDate,
      orNumber: payments.orNumber,
      amount: payments.amount,
      remarks: payments.remarks,
      recordedByName: users.fullName,
      establishmentName: establishments.name,
      ownerName: owners.fullName,
      taxYear: taxRecords.taxYear,
    })
    .from(payments)
    .innerJoin(taxRecords, eq(payments.taxRecordId, taxRecords.id))
    .innerJoin(establishments, eq(taxRecords.establishmentId, establishments.id))
    .innerJoin(owners, eq(establishments.ownerId, owners.id))
    .innerJoin(users, eq(payments.recordedBy, users.id))
    .where(whereClause)
    .orderBy(desc(payments.paymentDate))
    .limit(limit)
    .offset(offset);

  res.json(paginatedResponse(await attachItems(rows), total, page, pageSize));
});

router.get("/tax-record/:taxRecordId", requirePermission("payments:read"), async (req, res) => {
  const taxRecordId = Number(req.params.taxRecordId);
  const rows = await db
    .select({
      id: payments.id,
      taxRecordId: payments.taxRecordId,
      paymentDate: payments.paymentDate,
      orNumber: payments.orNumber,
      amount: payments.amount,
      remarks: payments.remarks,
      recordedByName: users.fullName,
    })
    .from(payments)
    .innerJoin(users, eq(payments.recordedBy, users.id))
    .where(eq(payments.taxRecordId, taxRecordId))
    .orderBy(desc(payments.paymentDate));
  res.json(await attachItems(rows));
});

router.get("/owner/:ownerId", requirePermission("payments:read"), async (req, res) => {
  const ownerId = Number(req.params.ownerId);
  const rows = await db
    .select({
      id: payments.id,
      taxRecordId: payments.taxRecordId,
      paymentDate: payments.paymentDate,
      orNumber: payments.orNumber,
      amount: payments.amount,
      remarks: payments.remarks,
      recordedByName: users.fullName,
      establishmentName: establishments.name,
      taxYear: taxRecords.taxYear,
    })
    .from(payments)
    .innerJoin(taxRecords, eq(payments.taxRecordId, taxRecords.id))
    .innerJoin(establishments, eq(taxRecords.establishmentId, establishments.id))
    .innerJoin(users, eq(payments.recordedBy, users.id))
    .where(eq(establishments.ownerId, ownerId))
    .orderBy(desc(payments.paymentDate));
  res.json(await attachItems(rows));
});

router.post("/", requirePermission("payments:write"), async (req, res) => {
  const { taxRecordId, paymentDate, orNumber, remarks, items } = req.body;
  if (!taxRecordId || !paymentDate || !orNumber?.trim()) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  let normalized;
  try {
    normalized = normalizeItems(items);
  } catch (msg) {
    return res.status(400).json({ message: String(msg) });
  }

  const [row] = await db
    .insert(payments)
    .values({
      taxRecordId: Number(taxRecordId),
      paymentDate,
      orNumber: orNumber.trim(),
      amount: normalized.total, // amount == receipt total
      remarks: remarks?.trim() || null,
      recordedBy: req.user.id,
    })
    .returning();

  await db
    .insert(paymentItems)
    .values(normalized.items.map((it) => ({ paymentId: row.id, ...it })));
  await ensureOptionsExist(normalized.items);

  await logActivity({
    userId: req.user.id,
    action: "Payment Recorded",
    module: "Payment",
    details: `OR ${row.orNumber} — ₱${normalized.total.toLocaleString()}`,
  });
  res.status(201).json({ ...row, items: normalized.items });
});

/* Edit a payment: replace its items and recompute its total. */
router.put("/:id", requirePermission("payments:write"), async (req, res) => {
  const id = Number(req.params.id);
  const { paymentDate, orNumber, remarks, items } = req.body;
  if (!paymentDate || !orNumber?.trim()) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  let normalized;
  try {
    normalized = normalizeItems(items);
  } catch (msg) {
    return res.status(400).json({ message: String(msg) });
  }

  const [existing] = await db.select().from(payments).where(eq(payments.id, id));
  if (!existing) return res.status(404).json({ message: "Payment not found." });

  const [row] = await db
    .update(payments)
    .set({
      paymentDate,
      orNumber: orNumber.trim(),
      amount: normalized.total,
      remarks: remarks?.trim() || null,
    })
    .where(eq(payments.id, id))
    .returning();

  // Replace the itemized breakdown.
  await db.delete(paymentItems).where(eq(paymentItems.paymentId, id));
  await db
    .insert(paymentItems)
    .values(normalized.items.map((it) => ({ paymentId: id, ...it })));
  await ensureOptionsExist(normalized.items);

  await logActivity({
    userId: req.user.id,
    action: "Payment Edited",
    module: "Payment",
    details: `OR ${row.orNumber} (payment #${id})`,
  });
  res.json({ ...row, items: normalized.items });
});

router.delete("/:id", requirePermission("payments:write"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(payments).where(eq(payments.id, id));
  if (!existing) return res.status(404).json({ message: "Payment not found." });

  // Remove child items first (FK), then the payment.
  await db.delete(paymentItems).where(eq(paymentItems.paymentId, id));
  await db.delete(payments).where(eq(payments.id, id));

  await logActivity({
    userId: req.user.id,
    action: "Payment Deleted",
    module: "Payment",
    details: `OR ${existing.orNumber} — ₱${Number(existing.amount).toLocaleString()} (${existing.paymentDate})`,
  });
  res.json({ message: "Payment deleted." });
});

export default router;
