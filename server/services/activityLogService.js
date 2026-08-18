import { db } from "../database/db.js";
import { activityLogs } from "../database/schema.js";

export async function logActivity({ userId, action, module, details }) {
  await db.insert(activityLogs).values({
    userId: userId ?? null,
    action,
    module,
    details: details ?? null,
  });
}
