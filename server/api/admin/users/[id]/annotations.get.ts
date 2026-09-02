import { desc, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { getRouterId } from "~~/server/utils/routeParams";

/**
 * One account's annotations, for the dropdown on its row in Accounts.
 *
 * The sibling of `submissions.get.ts`, and the same bargain: newest first,
 * hidden ones included, fetched only when a row is expanded. An admin looking at
 * an account wants everything it has written, and whether an annotation has been
 * hidden is part of what they came to see.
 *
 * The restroom is joined in because an annotation is unreadable without the
 * thing it is about.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const db = useDb(event);

  return await db
    .select({
      id: schema.annotations.id,
      body: schema.annotations.body,
      createdAt: schema.annotations.createdAt,
      hiddenAt: schema.annotations.hiddenAt,
      restroomSlug: schema.restrooms.slug,
      restroomName: schema.restrooms.name,
    })
    .from(schema.annotations)
    .innerJoin(
      schema.restrooms,
      eq(schema.annotations.restroomId, schema.restrooms.id),
    )
    .where(eq(schema.annotations.authorId, id))
    .orderBy(desc(schema.annotations.createdAt))
    .all();
});
