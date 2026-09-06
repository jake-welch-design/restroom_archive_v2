import { desc, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { purgeExpiredRejectionsQuietly } from "~~/server/utils/purgeRejections";

/**
 * Submissions that were turned down, and which of them can still be taken back.
 *
 * A browse list rather than a queue: nothing here is waiting on an admin, and
 * the usual outcome is that nothing happens and the scan expires. It carries no
 * badge and is fetched only when the section is opened.
 *
 * The sweep runs first, so the countdowns this returns are never showing time
 * left on a scan that has already gone.
 *
 * Filtered on `status = 'rejected'`, which leaves out a banned submitter's
 * rejected entries — those sit at `hidden` until the ban is lifted, and cannot
 * be restored from here anyway. The sweep does not use this filter; it has to
 * expire those too.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  await purgeExpiredRejectionsQuietly(event);

  const db = useDb(event);

  const rows = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      date: schema.restrooms.date,
      isoDate: schema.restrooms.isoDate,
      rejectionMessage: schema.restrooms.rejectionMessage,
      rejectedAt: schema.restrooms.rejectedAt,
      scanPurgedAt: schema.restrooms.scanPurgedAt,
      createdAt: schema.restrooms.createdAt,
      submitterUsername: schema.users.username,
      submitterName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.submittedBy, schema.users.id))
    .where(eq(schema.restrooms.status, "rejected"))
    // Most recent first, which puts anything still restorable at the top.
    // SQLite sorts NULLs last under DESC, so entries rejected before the grace
    // period existed fall to the bottom where they belong.
    .orderBy(desc(schema.restrooms.rejectedAt))
    .all();

  return rows.map((r) => ({
    ...r,
    // Decided here rather than in the client so the button and the endpoint's
    // own guard cannot disagree about what is restorable.
    restorable: Boolean(r.rejectedAt) && !r.scanPurgedAt,
    submitter: r.submitterUsername
      ? { username: r.submitterUsername, displayName: r.submitterName }
      : null,
  }));
});
