import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../database/db.js";
import { users } from "../database/schema.js";
import { JWT_SECRET } from "../config/env.js";
import { logActivity } from "../services/activityLogService.js";

const router = Router();

/* Public self-registration. Anyone at the login screen can create an account.
   Every self-registered account is an "encoder" — the general office-staff
   role (records payments + manages owners/establishments). Higher roles
   (treasurer, administrator) can only be granted afterwards by an existing
   administrator from the User Management screen, so nobody can self-promote.
   Returns a token so the new user is logged straight in. */
router.post("/register", async (req, res) => {
  const { username, password, fullName } = req.body;

  if (!username || !password || !fullName) {
    return res
      .status(400)
      .json({ message: "Username, full name, and password are required." });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ message: "Username must be at least 3 characters." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const role = "encoder";
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

  const token = jwt.sign(
    { id: created.id, username: created.username, role: created.role, fullName: created.fullName },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  await logActivity({
    userId: created.id,
    action: "Account Registered",
    module: "Auth",
    details: created.username,
  });

  res.status(201).json({
    token,
    user: {
      id: created.id,
      username: created.username,
      fullName: created.fullName,
      role: created.role,
    },
  });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()));

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  await logActivity({
    userId: user.id,
    action: "Login",
    module: "Auth",
    details: user.username,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

export default router;
