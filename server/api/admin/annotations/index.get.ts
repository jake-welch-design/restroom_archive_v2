import { desc, eq, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const db = useDb(event);

  const openReports = sql<number>`(
    SELECT COUNT(*) FROM ${schema.annotationReports}
    WHERE ${schema.annotationReports.annotationId} = ${schema.annotations.id}
      AND ${schema.annotationReports.resolvedAt} IS NULL
  )`;

  const rows = await db
    .select({
      id: schema.annotations.id,
      body: schema.annotations.body,
      createdAt: schema.annotations.createdAt,
      hiddenAt: schema.annotations.hiddenAt,
      restroomSlug: schema.restrooms.slug,
      restroomName: schema.restrooms.name,
      restroomLocation: schema.restrooms.location,
      restroomDate: schema.restrooms.date,
      authorUsername: schema.users.username,
      authorDisplayName: schema.users.displayName,
      openReportCount: openReports,
    })
    .from(schema.annotations)
    .innerJoin(
      schema.restrooms,
      eq(schema.annotations.restroomId, schema.restrooms.id),
    )
    .leftJoin(schema.users, eq(schema.annotations.authorId, schema.users.id))
    .orderBy(desc(schema.annotations.createdAt))
    .limit(500)
    .all();

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    hiddenAt: r.hiddenAt,
    openReportCount: r.openReportCount,
    restroom: {
      slug: r.restroomSlug,
      name: r.restroomName,
      location: r.restroomLocation,
      date: r.restroomDate,
    },
    author: r.authorUsername
      ? { username: r.authorUsername, displayName: r.authorDisplayName }
      : null,
  }));
});
