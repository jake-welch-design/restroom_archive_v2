import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const db = useDb(event);

  const annotation = await db
    .select({ id: schema.annotations.id })
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .get();

  if (!annotation)
    throw createError({
      statusCode: 404,
      statusMessage: "Annotation not found",
    });

  await db
    .update(schema.annotations)
    .set({ hiddenAt: null, hiddenBy: null })
    .where(eq(schema.annotations.id, id));

  await recordAdminAction(event, "annotation.unhide", "annotation", id);

  return { ok: true };
});
