import { Router } from "express";
import { eq, and, or, like, desc, sql, count, inArray } from "drizzle-orm";
import { db } from "../database/db.js";
import {
  taxRecords,
  payments,
  paymentItems,
  establishments,
  barangays,
  owners,
} from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { computePaymentStatus } from "../services/paymentStatus.js";
import { logActivity } from "../services/activityLogService.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";

const router = Router();
router.use(authenticate);

async function enrichTaxRecord(record) {
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.taxRecordId, record.id));
  const { totalPaid, balance, status } = computePaymentStatus({
    taxDue: record.taxDue,
    paymentSchedule: record.paymentSchedule,
    payments: paymentRows,
  });
  return { ...record, totalPaid, balance, status, payments: paymentRows };
}

router.get("/", requirePermission("tax_records:read"), async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : null;
  const search = req.query.search?.trim()?.toLowerCase();
  const { page, pageSize, limit, offset } = parsePagination(req.query);

  // Year + free-text search are applied in SQL (search spans the joined
  // establishment / owner / barangay display names).
  // Exclude tax records whose establishment was deleted (soft-removed). Their
  // payments still live in the owner profile and Excel, but the assessment
  // should no longer appear in the active Tax Collection list.
  const conditions = [eq(establishments.isArchived, false)];
  if (year) conditions.push(eq(taxRecords.taxYear, year));
  if (search) {
    conditions.push(
      or(
        like(sql`lower(${establishments.name})`, `%${search}%`),
        like(sql`lower(${owners.fullName})`, `%${search}%`),
        like(sql`lower(${barangays.name})`, `%${search}%`)
      )
    );
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(taxRecords)
    .innerJoin(establishments, eq(taxRecords.establishmentId, establishments.id))
    .innerJoin(barangays, eq(establishments.barangayId, barangays.id))
    .innerJoin(owners, eq(establishments.ownerId, owners.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: taxRecords.id,
      establishmentId: taxRecords.establishmentId,
      taxYear: taxRecords.taxYear,
      taxDue: taxRecords.taxDue,
      paymentSchedule: taxRecords.paymentSchedule,
      establishmentName: establishments.name,
      barangayName: barangays.name,
      ownerName: owners.fullName,
    })
    .from(taxRecords)
    .innerJoin(establishments, eq(taxRecords.establishmentId, establishments.id))
    .innerJoin(barangays, eq(establishments.barangayId, barangays.id))
    .innerJoin(owners, eq(establishments.ownerId, owners.id))
    .where(whereClause)
    .orderBy(desc(taxRecords.taxYear), desc(taxRecords.id))
    .limit(limit)
    .offset(offset);

  // Enrich only the current page of rows. Each row already carries
  // establishmentName / barangayName / ownerName from the joins above.
  const enriched = await Promise.all(rows.map((r) => enrichTaxRecord(r)));
  res.json(paginatedResponse(enriched, total, page, pageSize));
});

router.get("/establishment/:establishmentId", requirePermission("tax_records:read"), async (req, res) => {
  const establishmentId = Number(req.params.establishmentId);
  const rows = await db
    .select()
    .from(taxRecords)
    .where(eq(taxRecords.establishmentId, establishmentId));
  const enriched = await Promise.all(rows.map(enrichTaxRecord));
  res.json(enriched);
});

router.post("/", requirePermission("tax_records:write"), async (req, res) => {
  const { establishmentId, taxYear, taxDue, paymentSchedule } = req.body;
  if (!establishmentId || !taxYear || taxDue == null || !paymentSchedule) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  try {
    const [row] = await db
      .insert(taxRecords)
      .values({
        establishmentId: Number(establishmentId),
        taxYear: Number(taxYear),
        taxDue: Number(taxDue),
        paymentSchedule,
      })
      .returning();
    await logActivity({
      userId: req.user.id,
      action: "Add Record",
      module: "Tax Record",
      details: `${row.taxYear} / est ${row.establishmentId}`,
    });
    res.status(201).json(await enrichTaxRecord(row));
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Tax record for this year already exists" });
    }
    throw err;
  }
});

router.put("/:id", requirePermission("tax_records:write"), async (req, res) => {
  const id = Number(req.params.id);
  const { taxDue, paymentSchedule } = req.body;
  const [row] = await db
    .update(taxRecords)
    .set({
      taxDue: taxDue != null ? Number(taxDue) : undefined,
      paymentSchedule,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(taxRecords.id, id))
    .returning();
  if (!row) return res.status(404).json({ message: "Not found" });
  await logActivity({
    userId: req.user.id,
    action: "Edit Record",
    module: "Tax Record",
    details: String(id),
  });
  res.json(await enrichTaxRecord(row));
});

/* Permanently delete a tax record.

   This is a HARD delete: it removes the assessment AND every payment recorded
   against it (and each payment's line items). Because foreign_keys = ON, the
   children must go first — payment_items → payments → tax_record — otherwise
   SQLite rejects the delete. Wrapped in a single transaction so a failure
   mid-way can never leave orphaned payments behind.

   NOTE: this intentionally destroys payment history for the record, which is
   why it is exposed only as an explicit, confirmed "permanent delete" action
   in the UI (and every deletion is written to the Activity Logs below). */
router.delete("/:id", requirePermission("tax_records:write"), async (req, res) => {
  const id = Number(req.params.id);

  const [record] = await db.select().from(taxRecords).where(eq(taxRecords.id, id));
  if (!record) return res.status(404).json({ message: "Tax record not found." });

  // Collect the payment ids so we can clear their line items first.
  const paymentRows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.taxRecordId, id));
  const paymentIds = paymentRows.map((p) => p.id);

  const removeAll = db.transaction((tx) => {
    if (paymentIds.length > 0) {
      tx.delete(paymentItems).where(inArray(paymentItems.paymentId, paymentIds)).run();
      tx.delete(payments).where(eq(payments.taxRecordId, id)).run();
    }
    tx.delete(taxRecords).where(eq(taxRecords.id, id)).run();
  });
  removeAll();

  await logActivity({
    userId: req.user.id,
    action: "Tax Record Deleted (permanent)",
    module: "Tax Record",
    details: `${record.taxYear} / est ${record.establishmentId} — removed ${paymentIds.length} payment(s)`,
  });

  res.json({
    message:
      paymentIds.length > 0
        ? `Tax record deleted permanently, along with ${paymentIds.length} payment(s).`
        : "Tax record deleted permanently.",
    deletedPayments: paymentIds.length,
  });
});

export default router;