import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "../database/db.js";
import { feeOptions } from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();
router.use(authenticate);

const CATEGORIES = ["business_tax", "mayors_permit", "regulatory"];

/* List options. By default only active ones (for the payment form); pass
   ?all=true to include inactive (for the management page). */
router.get("/", requirePermission("payments:read"), async (req, res) => {
  const rows = await db
    .select()
    .from(feeOptions)
    .orderBy(asc(feeOptions.category), asc(feeOptions.sortOrder), asc(feeOptions.id));
  const list = req.query.all === "true" ? rows : rows.filter((r) => r.isActive);
  res.json(list);
});

/* Add an option. Used both by the management page and by the "custom item" box
   on the payment form (so a typed-in item is remembered for next time). */
router.post("/", requirePermission("payments:write"), async (req, res) => {
  const { category, label } = req.body;
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ message: "Invalid category." });
  }
  if (!label?.trim()) {
    return res.status(400).json({ message: "Label is required." });
  }
  const clean = label.trim();

  // Avoid duplicates within a category (case-insensitive). If it already
  // exists, just return it — and reactivate if it was deactivated.
  const existing = (
    await db.select().from(feeOptions).where(eq(feeOptions.category, category))
  ).find((o) => o.label.toLowerCase() === clean.toLowerCase());
  if (existing) {
    if (!existing.isActive) {
      await db.update(feeOptions).set({ isActive: true }).where(eq(feeOptions.id, existing.id));
    }
    return res.status(200).json({ ...existing, isActive: true });
  }

  const [row] = await db
    .insert(feeOptions)
    .values({ category, label: clean, sortOrder: 999 })
    .returning();
  await logActivity({
    userId: req.user.id,
    action: "Fee Option Added",
    module: "FeeOptions",
    details: `${category}: ${clean}`,
  });
  res.status(201).json(row);
});

router.put("/:id", requirePermission("payments:write"), async (req, res) => {
  const id = Number(req.params.id);
  const { label, isActive, sortOrder } = req.body;
  const updates = {};
  if (label !== undefined) {
    if (!label.trim()) return res.status(400).json({ message: "Label cannot be empty." });
    updates.label = label.trim();
  }
  if (isActive !== undefined) updates.isActive = isActive;
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

  const [row] = await db.update(feeOptions).set(updates).where(eq(feeOptions.id, id)).returning();
  if (!row) return res.status(404).json({ message: "Option not found." });
  await logActivity({
    userId: req.user.id,
    action: "Fee Option Updated",
    module: "FeeOptions",
    details: row.label,
  });
  res.json(row);
});

/* Delete an option. Past payments keep their own label snapshot, so removing
   an option here never affects historical records. */
router.delete("/:id", requirePermission("payments:write"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(feeOptions).where(eq(feeOptions.id, id));
  if (!existing) return res.status(404).json({ message: "Option not found." });
  await db.delete(feeOptions).where(eq(feeOptions.id, id));
  await logActivity({
    userId: req.user.id,
    action: "Fee Option Deleted",
    module: "FeeOptions",
    details: existing.label,
  });
  res.json({ message: "Option deleted." });
});

export default router;
