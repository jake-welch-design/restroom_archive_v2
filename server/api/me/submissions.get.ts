import { desc, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

export default defineEventHandler(async (event) => {
  const user = requireRole(event, "archivist");

  const db = useDb(event);

  const rows = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      date: schema.restrooms.date,
      isoDate: schema.restrooms.isoDate,
      status: schema.restrooms.status,
      createdAt: schema.restrooms.createdAt,
      removalRequestedBy: schema.restrooms.removalRequestedBy,
      removalMessage: schema.restrooms.removalMessage,
      rejectionMessage: schema.restrooms.rejectionMessage,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.submittedBy, user.id))
    .orderBy(desc(schema.restrooms.createdAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    location: r.location,
    date: r.date,
    isoDate: r.isoDate,
    status: r.status,
    createdAt: r.createdAt,
    // Survives being granted, so a `removed` entry can still say whether its
    // own submitter is the one who asked for it to go.
    removalRequested: r.removalRequestedBy != null,
    removalMessage: r.removalMessage ?? null,
    rejectionMessage: r.rejectionMessage ?? null,
  }));
});
