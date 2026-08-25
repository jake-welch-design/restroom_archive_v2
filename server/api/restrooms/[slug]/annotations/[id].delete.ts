import { and, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { getRouterId, getRouterString } from "~~/server/utils/routeParams";

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);

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
      authorId: schema.annotations.authorId,
      restroomId: schema.annotations.restroomId,
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

  if (annotation.authorId !== user.id && user.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only delete your own annotations.",
    });
  }

  await db
    .delete(schema.annotations)
    .where(
      and(
        eq(schema.annotations.id, id),
        eq(schema.annotations.restroomId, restroom.id),
      ),
    );

  return { ok: true };
});
