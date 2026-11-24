import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { deleteUserAccount } from "~~/server/utils/deleteUserAccount";

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

  await deleteUserAccount(db, id);
  await recordAdminAction(event, "user.delete", "user", id);

  return { ok: true };
});
