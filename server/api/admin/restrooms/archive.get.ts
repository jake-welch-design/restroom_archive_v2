import { desc, eq, inArray } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

/**
 * Every entry that reached the archive, live or since taken out of it.
 *
 * A browse list rather than a queue: there is no backlog to clear, so it carries
 * no badge and is fetched only when the section is first opened.
 *
 * `pending` and `rejected` are excluded because neither was ever in the archive.
 * Pending submissions have their own queue, which previews the scan — the only
 * way to judge one — and rejected entries are gone, blobs and all. What is left
 * is what an admin might want to take down, plus the record of what already was.
 */
const ARCHIVE_STATUSES = ["published", "hidden", "removed"];

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

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
      removalMessage: schema.restrooms.removalMessage,
      removalRequestedBy: schema.restrooms.removalRequestedBy,
      createdAt: schema.restrooms.createdAt,
      submitterUsername: schema.users.username,
      submitterName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.submittedBy, schema.users.id))
    .where(inArray(schema.restrooms.status, ARCHIVE_STATUSES))
    .orderBy(desc(schema.restrooms.isoDate))
    .limit(500)
    .all();

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    location: r.location,
    date: r.date,
    isoDate: r.isoDate,
    status: r.status,
    removalMessage: r.removalMessage,
    // Distinguishes a takedown the submitter asked for from one they did not,
    // which is the difference between the two ways a row reaches `removed`.
    removalRequested: r.removalRequestedBy != null,
    createdAt: r.createdAt,
    submitter: r.submitterUsername
      ? { username: r.submitterUsername, displayName: r.submitterName }
      : null,
  }));
});
