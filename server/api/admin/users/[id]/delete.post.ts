import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, "admin");

  const id = getRouterId(event);
  if (id === actor.id)
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot delete yourself",
    });

  const db = useDb(event);

  const target = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();

  if (!target)
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  if (target.role === "admin")
    throw createError({
      statusCode: 409,
      statusMessage: "Cannot delete an admin account",
    });

  // Null out FK references so restrooms stay in the archive (unattributed)
  await db
    .update(schema.restrooms)
    .set({ submittedBy: null, updatedAt: now() })
    .where(eq(schema.restrooms.submittedBy, id));

  await db
    .update(schema.restrooms)
    .set({ removalRequestedBy: null })
    .where(eq(schema.restrooms.removalRequestedBy, id));

  // Preserve report history made by this user; null out their reporter_id.
  // (Reports they received cascade-delete with their annotations below.)
  await db
    .update(schema.annotationReports)
    .set({ reporterId: null })
    .where(eq(schema.annotationReports.reporterId, id));

  // Remove the user's annotations before deleting the account
  await db
    .delete(schema.annotations)
    .where(eq(schema.annotations.authorId, id));

  await db.delete(schema.users).where(eq(schema.users.id, id));

  await recordAdminAction(event, "user.delete", "user", id);

  return { ok: true };
});
