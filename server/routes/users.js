import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, ne, and } from "drizzle-orm";
import { db } from "../database/db.js";
import { users } from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

const ALL_ROLES = ["administrator", "treasurer", "cashier", "encoder"];

/* Never expose password hashes to the client. */
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

/** Count of active administrators — used to prevent locking out the office. */
async function activeAdminCount() {
  const admins = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "administrator"), eq(users.isActive, true)));
  return admins.length;
}

/* List all accounts (no password data). */
router.get("/", async (_req, res) => {
  const rows = await db.select().from(users);
  res.json(rows.map(publicUser));
});

/* Create a user (admin can assign ANY role, including administrator). */
router.post("/", async (req, res) => {
  const { username, password, fullName, role } = req.body;

  if (!username || !password || !fullName || !role) {
    return res
      .status(400)
      .json({ message: "Username, full name, password, and role are required." });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ message: "Username must be at least 3 characters." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }
  if (!ALL_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid role." });
  }

  const cleanUsername = username.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, cleanUsername));
  if (existing) {
    return res.status(409).json({ message: "That username is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({ username: cleanUsername, passwordHash, fullName: fullName.trim(), role })
    .returning();

  await logActivity({
    userId: req.user.id,
    action: "User Created",
    module: "Users",
    details: created.username,
  });
  res.status(201).json(publicUser(created));
});

/* Update full name, role, and active status (not the password — see below). */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, role, isActive } = req.body;

  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return res.status(404).json({ message: "User not found." });

  if (role && !ALL_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid role." });
  }

  // Guard: don't allow removing the last administrator (by demotion or
  // deactivation), which would lock everyone out of user management.
  const demoting = role && role !== "administrator" && target.role === "administrator";
  const deactivating = isActive === false && target.isActive && target.role === "administrator";
  if ((demoting || deactivating) && (await activeAdminCount()) <= 1) {
    return res
      .status(400)
      .json({ message: "Cannot remove the last active administrator." });
  }

  // Guard: an admin can't deactivate their own account.
  if (isActive === false && id === req.user.id) {
    return res.status(400).json({ message: "You cannot deactivate your own account." });
  }

  const updates = {};
  if (fullName !== undefined) updates.fullName = fullName.trim();
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();

  await logActivity({
    userId: req.user.id,
    action: "User Updated",
    module: "Users",
    details: updated.username,
  });
  res.json(publicUser(updated));
});

/* Reset a user's password (admin sets the new one). */
router.patch("/:id/password", async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return res.status(404).json({ message: "User not found." });

  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));

  await logActivity({
    userId: req.user.id,
    action: "Password Reset",
    module: "Users",
    details: target.username,
  });
  res.json({ message: "Password updated." });
});

/* Delete a user. */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account." });
  }

  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return res.status(404).json({ message: "User not found." });

  if (target.role === "administrator" && (await activeAdminCount()) <= 1) {
    return res
      .status(400)
      .json({ message: "Cannot delete the last active administrator." });
  }

  await db.delete(users).where(and(eq(users.id, id), ne(users.id, req.user.id)));

  await logActivity({
    userId: req.user.id,
    action: "User Deleted",
    module: "Users",
    details: target.username,
  });
  res.json({ message: "User deleted." });
});

export default router;
