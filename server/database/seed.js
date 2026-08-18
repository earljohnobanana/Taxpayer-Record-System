import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { pathToFileURL } from "url";
import "./migrate.js";
import { db } from "./db.js";
import { users } from "./schema.js";

/**
 * Idempotent: creates the default administrator only if no "admin" user
 * exists yet. Safe to call on every server startup — a fresh install
 * (empty database in the user's AppData folder) gets a working login,
 * while an existing database is left untouched.
 *
 * @returns {Promise<boolean>} true if the default admin was just created
 */
export async function ensureDefaultAdmin() {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, "admin"));

  if (existing.length > 0) return false;

  const passwordHash = await bcrypt.hash("admin123", 10);
  await db.insert(users).values({
    username: "admin",
    passwordHash,
    fullName: "System Administrator",
    role: "administrator",
  });

  console.log("Default admin created — username: admin, password: admin123");
  console.log("Change this password after first login.");
  return true;
}

/* Allow running this file directly as a CLI (npm run db:seed) while ALSO
   exporting ensureDefaultAdmin for the server to call on startup. */
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  ensureDefaultAdmin()
    .then((created) => {
      if (!created) console.log("Admin user already exists. Skipping seed.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
