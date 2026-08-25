import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const { limit, offset } = await getValidatedQuery(event, Query.parse);

  const db = useDb(event);

  const rows = await db
    .select({
      id: schema.adminAuditLog.id,
      action: schema.adminAuditLog.action,
      targetType: schema.adminAuditLog.targetType,
      targetId: schema.adminAuditLog.targetId,
      metadata: schema.adminAuditLog.metadata,
      createdAt: schema.adminAuditLog.createdAt,
      actorId: schema.adminAuditLog.actorId,
      actorUsername: schema.users.username,
      actorDisplayName: schema.users.displayName,
    })
    .from(schema.adminAuditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.adminAuditLog.actorId))
    .orderBy(
      desc(schema.adminAuditLog.createdAt),
      desc(schema.adminAuditLog.id),
    )
    .limit(limit)
    .offset(offset)
    .all();

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.createdAt,
    actor: r.actorId
      ? {
          id: r.actorId,
          username: r.actorUsername,
          displayName: r.actorDisplayName,
        }
      : null,
  }));
});
