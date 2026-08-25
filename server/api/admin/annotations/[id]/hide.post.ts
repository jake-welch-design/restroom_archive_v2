import { eq, isNull, and } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, "admin");

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
    .set({ hiddenAt: now(), hiddenBy: actor.id })
    .where(eq(schema.annotations.id, id));

  await db
    .update(schema.annotationReports)
    .set({ resolvedAt: now(), resolvedBy: actor.id })
    .where(
      and(
        eq(schema.annotationReports.annotationId, id),
        isNull(schema.annotationReports.resolvedAt),
      ),
    );

  await recordAdminAction(event, "annotation.hide", "annotation", id);

  return { ok: true };
});
