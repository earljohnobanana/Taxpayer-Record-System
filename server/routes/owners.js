import { Router } from "express";
import { eq, like, or, sql } from "drizzle-orm";
import { db } from "../database/db.js";
import { owners, establishments } from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("owners:read"), async (req, res) => {
  const search = req.query.search?.trim()?.toLowerCase();
  const rows = await db
    .select()
    .from(owners)
    .where(
      search
        ? or(
            like(sql`lower(${owners.fullName})`, `%${search}%`),
            like(sql`lower(${owners.tin})`, `%${search}%`)
          )
        : undefined
    );
  res.json(rows);
});

router.get("/:id", requirePermission("owners:read"), async (req, res) => {
  const id = Number(req.params.id);
  const [owner] = await db.select().from(owners).where(eq(owners.id, id));
  if (!owner) return res.status(404).json({ message: "Not found" });
  const owned = await db
    .select()
    .from(establishments)
    .where(eq(establishments.ownerId, id));
  res.json({ ...owner, establishments: owned });
});

router.post("/", requirePermission("owners:write"), async (req, res) => {
  const { fullName, address, contactNumber, tin, notes } = req.body;
  if (!fullName?.trim() || !address?.trim()) {
    return res.status(400).json({ message: "Full name and address are required" });
  }
  const [row] = await db
    .insert(owners)
    .values({
      fullName: fullName.trim(),
      address: address.trim(),
      contactNumber: contactNumber?.trim() || null,
      tin: tin?.trim() || null,
      notes: notes?.trim() || null,
    })
    .returning();
  await logActivity({
    userId: req.user.id,
    action: "Add Record",
    module: "Owner",
    details: row.fullName,
  });
  res.status(201).json(row);
});

router.put("/:id", requirePermission("owners:write"), async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, address, contactNumber, tin, notes } = req.body;
  const [row] = await db
    .update(owners)
    .set({
      fullName: fullName?.trim(),
      address: address?.trim(),
      contactNumber: contactNumber?.trim() || null,
      tin: tin?.trim() || null,
      notes: notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(owners.id, id))
    .returning();
  if (!row) return res.status(404).json({ message: "Not found" });
  await logActivity({
    userId: req.user.id,
    action: "Edit Record",
    module: "Owner",
    details: String(id),
  });
  res.json(row);
});

export default router;
