import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../database/db.js";
import {
  barangays,
  owners,
  establishments,
  taxRecords,
  payments,
} from "../database/schema.js";
import { computePaymentStatus } from "../services/paymentStatus.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

const router = Router();
router.use(authenticate);
router.use(requirePermission("dashboard:read"));

router.get("/summary", async (_req, res) => {
  const [bCount, oCount, eCount, tCount] = await Promise.all([
    db.select().from(barangays),
    db.select().from(owners),
    db.select().from(establishments),
    db.select().from(taxRecords),
  ]);

  const allTax = await db.select().from(taxRecords);
  let fullyPaid = 0;
  let partiallyPaid = 0;
  let unpaid = 0;
  let totalCollections = 0;

  for (const tr of allTax) {
    const pRows = await db
      .select()
      .from(payments)
      .where(eq(payments.taxRecordId, tr.id));
    const { status, totalPaid } = computePaymentStatus({
      taxDue: tr.taxDue,
      paymentSchedule: tr.paymentSchedule,
      payments: pRows,
    });
    totalCollections += totalPaid;
    if (status === "Fully Paid") fullyPaid++;
    else if (status === "Not Paid") unpaid++;
    else partiallyPaid++;
  }

  const recentPayments = await db
    .select()
    .from(payments)
    .orderBy(desc(payments.id))
    .limit(10);

  res.json({
    totalBarangays: bCount.filter((b) => !b.isArchived).length,
    totalOwners: oCount.length,
    totalEstablishments: eCount.filter((e) => !e.isArchived).length,
    totalTaxRecords: tCount.length,
    totalCollections,
    fullyPaid,
    partiallyPaid,
    unpaid,
    recentPayments,
  });
});

export default router;
