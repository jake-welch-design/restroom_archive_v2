import { desc, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

export default defineEventHandler(async (event) => {
  const user = requireRole(event, "archivist");

  const db = useDb(event);

  const rows = await db
    .select({
      id: schema.annotations.id,
      body: schema.annotations.body,
      createdAt: schema.annotations.createdAt,
      restroomSlug: schema.restrooms.slug,
      restroomName: schema.restrooms.name,
      restroomLocation: schema.restrooms.location,
      restroomDate: schema.restrooms.date,
    })
    .from(schema.annotations)
    .innerJoin(
      schema.restrooms,
      eq(schema.annotations.restroomId, schema.restrooms.id),
    )
    .where(eq(schema.annotations.authorId, user.id))
    .orderBy(desc(schema.annotations.createdAt))
    .all();

  return rows;
});
