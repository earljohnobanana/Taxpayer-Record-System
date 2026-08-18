import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../database/db.js";
import {
  establishments,
  barangays,
  owners,
  taxRecords,
  payments,
  paymentItems,
} from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("establishments:read"), async (req, res) => {
  const rows = await db
    .select({
      id: establishments.id,
      name: establishments.name,
      businessType: establishments.businessType,
      address: establishments.address,
      status: establishments.status,
      isArchived: establishments.isArchived,
      barangayId: establishments.barangayId,
      ownerId: establishments.ownerId,
      barangayName: barangays.name,
      ownerName: owners.fullName,
    })
    .from(establishments)
    .innerJoin(barangays, eq(establishments.barangayId, barangays.id))
    .innerJoin(owners, eq(establishments.ownerId, owners.id));

  const includeArchived = req.query.includeArchived === "true";
  const filtered = includeArchived ? rows : rows.filter((r) => !r.isArchived);
  res.json(filtered);
});

router.post("/", requirePermission("establishments:write"), async (req, res) => {
  const {
    name,
    barangayId,
    ownerId,
    businessType,
    address,
    status,
    notes,
  } = req.body;
  if (!name?.trim() || !barangayId || !ownerId || !businessType?.trim() || !address?.trim()) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  const [row] = await db
    .insert(establishments)
    .values({
      name: name.trim(),
      barangayId: Number(barangayId),
      ownerId: Number(ownerId),
      businessType: businessType.trim(),
      address: address.trim(),
      status: status || "active",
      notes: notes?.trim() || null,
    })
    .returning();
  await logActivity({
    userId: req.user.id,
    action: "Add Record",
    module: "Establishment",
    details: row.name,
  });
  res.status(201).json(row);
});

router.put("/:id", requirePermission("establishments:write"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(establishments)
    .set({
      name: req.body.name?.trim(),
      barangayId: Number(req.body.barangayId),
      ownerId: Number(req.body.ownerId),
      businessType: req.body.businessType?.trim(),
      address: req.body.address?.trim(),
      status: req.body.status,
      notes: req.body.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(establishments.id, id))
    .returning();
  if (!row) return res.status(404).json({ message: "Not found" });
  await logActivity({
    userId: req.user.id,
    action: "Edit Record",
    module: "Establishment",
    details: String(id),
  });
  res.json(row);
});

/* Permanently delete an establishment.

   This is a HARD delete that also removes everything hanging off the
   establishment: its tax records, every payment against those records, and each
   payment's line items. Because foreign_keys = ON, children must be removed
   before their parents — payment_items → payments → tax_records → establishment
   — so the whole thing runs in one transaction and can't leave orphaned rows.

   (Previously an establishment with history was only ARCHIVED. It is now truly
   deleted on request, which is why the confirmation in the UI is explicit that
   this cannot be undone. Every deletion is written to the Activity Logs.) */
router.delete("/:id", requirePermission("establishments:write"), async (req, res) => {
  const id = Number(req.params.id);

  const [est] = await db.select().from(establishments).where(eq(establishments.id, id));
  if (!est) return res.status(404).json({ message: "Not found" });

  // Gather the tax records and their payments so children can be cleared first.
  const recordRows = await db
    .select({ id: taxRecords.id })
    .from(taxRecords)
    .where(eq(taxRecords.establishmentId, id));
  const recordIds = recordRows.map((r) => r.id);

  const paymentRows = recordIds.length
    ? await db
        .select({ id: payments.id })
        .from(payments)
        .where(inArray(payments.taxRecordId, recordIds))
    : [];
  const paymentIds = paymentRows.map((p) => p.id);

  const removeAll = db.transaction((tx) => {
    if (paymentIds.length > 0) {
      tx.delete(paymentItems).where(inArray(paymentItems.paymentId, paymentIds)).run();
      tx.delete(payments).where(inArray(payments.id, paymentIds)).run();
    }
    if (recordIds.length > 0) {
      tx.delete(taxRecords).where(inArray(taxRecords.id, recordIds)).run();
    }
    tx.delete(establishments).where(eq(establishments.id, id)).run();
  });
  removeAll();

  await logActivity({
    userId: req.user.id,
    action: "Establishment Deleted (permanent)",
    module: "Establishment",
    details: `${est.name} — removed ${recordIds.length} tax record(s), ${paymentIds.length} payment(s)`,
  });

  res.json({
    message:
      recordIds.length > 0
        ? `Establishment deleted permanently, along with ${recordIds.length} tax record(s) and ${paymentIds.length} payment(s).`
        : "Establishment deleted permanently.",
    hardDeleted: true,
  });
});

export default router;
