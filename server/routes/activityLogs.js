import { Router } from "express";
import { desc, eq, or, like, sql, count } from "drizzle-orm";
import { db } from "../database/db.js";
import { activityLogs, users } from "../database/schema.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";

const router = Router();
router.use(authenticate);
router.use(requirePermission("activity_logs:read"));

router.get("/", async (req, res) => {
  const search = req.query.search?.trim()?.toLowerCase();
  const { page, pageSize, limit, offset } = parsePagination(req.query);

  // Search spans user name, module, action, and details — all in SQL now,
  // replacing the old client-side filter over a hardcoded 200-row cap.
  const whereClause = search
    ? or(
        like(sql`lower(${users.fullName})`, `%${search}%`),
        like(sql`lower(${activityLogs.module})`, `%${search}%`),
        like(sql`lower(${activityLogs.action})`, `%${search}%`),
        like(sql`lower(${activityLogs.details})`, `%${search}%`)
      )
    : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      module: activityLogs.module,
      details: activityLogs.details,
      createdAt: activityLogs.createdAt,
      userName: users.fullName,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(activityLogs.id))
    .limit(limit)
    .offset(offset);

  res.json(paginatedResponse(rows, total, page, pageSize));
});

export default router;
