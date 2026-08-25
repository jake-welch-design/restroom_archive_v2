import { and, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { getRouterId, getRouterString } from "~~/server/utils/routeParams";

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "report-annotation", {
    max: 10,
    windowSec: 86400,
  });

  const slug = getRouterString(event, "slug");
  const id = getRouterId(event);

  const db = useDb(event);

  const restroom = await db
    .select({ id: schema.restrooms.id })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();

  if (!restroom)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  const annotation = await db
    .select({
      id: schema.annotations.id,
      restroomId: schema.annotations.restroomId,
      authorId: schema.annotations.authorId,
    })
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .get();

  if (!annotation || annotation.restroomId !== restroom.id) {
    throw createError({
      statusCode: 404,
      statusMessage: "Annotation not found",
    });
  }

  if (annotation.authorId === user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot report your own annotation.",
    });
  }

  // Idempotent: if this user already reported this annotation, no-op.
  const existing = await db
    .select({ id: schema.annotationReports.id })
    .from(schema.annotationReports)
    .where(
      and(
        eq(schema.annotationReports.annotationId, id),
        eq(schema.annotationReports.reporterId, user.id),
      ),
    )
    .get();

  if (existing) return { ok: true, alreadyReported: true };

  await db.insert(schema.annotationReports).values({
    annotationId: id,
    reporterId: user.id,
    reason: null,
  });

  return { ok: true };
});
