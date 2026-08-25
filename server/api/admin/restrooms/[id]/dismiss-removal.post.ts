import { eq, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";

// Turns a removal request down: the request leaves the queue and the entry
// stays exactly as it was. The opposite outcome from `remove`.
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = Number(getRouterParam(event, "id"));
  if (!id) throw createError({ statusCode: 400, statusMessage: "Invalid id" });

  const db = useDb(event);

  const row = await db
    .update(schema.restrooms)
    .set({
      removalRequestedBy: null,
      removalReason: null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id })
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  await recordAdminAction(event, "restroom.dismiss-removal", "restroom", id);

  return { ok: true };
});
