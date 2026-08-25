import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const db = useDb(event);

  const row = await db
    .update(schema.restrooms)
    .set({ status: "published", updatedAt: now() })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id, slug: schema.restrooms.slug })
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  await recordAdminAction(event, "restroom.publish", "restroom", id);

  return { ok: true, slug: row.slug };
});
