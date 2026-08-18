import { Router } from "express";
import { eq, like, and, sql } from "drizzle-orm";
import { db } from "../database/db.js";
import { barangays } from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("barangays:read"), async (req, res) => {
  const search = req.query.search?.trim();
  const includeArchived = req.query.includeArchived === "true";

  const conditions = [];
  if (!includeArchived) {
    conditions.push(eq(barangays.isArchived, false));
  }
  if (search) {
    conditions.push(like(sql`lower(${barangays.name})`, `%${search.toLowerCase()}%`));
  }

  const rows = await db
    .select()
    .from(barangays)
    .where(conditions.length ? and(...conditions) : undefined);
  res.json(rows);
});

router.post("/", requirePermission("barangays:write"), async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ message: "Barangay name is required" });
  }
  try {
    const [row] = await db
      .insert(barangays)
      .values({ name: name.trim(), description: description?.trim() || null })
      .returning();
    await logActivity({
      userId: req.user.id,
      action: "Add Record",
      module: "Barangay",
      details: row.name,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Barangay already exists" });
    }
    throw err;
  }
});

router.put("/:id", requirePermission("barangays:write"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;
  const [row] = await db
    .update(barangays)
    .set({
      name: name?.trim(),
      description: description?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(barangays.id, id))
    .returning();
  if (!row) return res.status(404).json({ message: "Not found" });
  await logActivity({
    userId: req.user.id,
    action: "Edit Record",
    module: "Barangay",
    details: String(id),
  });
  res.json(row);
});

router.patch("/:id/archive", requirePermission("barangays:write"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(barangays)
    .set({ isArchived: true, updatedAt: new Date().toISOString() })
    .where(eq(barangays.id, id))
    .returning();
  if (!row) return res.status(404).json({ message: "Not found" });
  await logActivity({
    userId: req.user.id,
    action: "Archive Record",
    module: "Barangay",
    details: String(id),
  });
  res.json(row);
});

export default router;
