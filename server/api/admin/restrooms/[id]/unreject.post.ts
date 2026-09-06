import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { purgeExpiredRejectionsQuietly } from "~~/server/utils/purgeRejections";
import { now } from "~~/server/utils/sqlTime";

/**
 * Takes a rejection back, putting the submission into the review queue again.
 *
 * Back to `pending`, not straight to `published`: the pending queue is the only
 * place that previews the scan, and an entry being restored is precisely one
 * nobody has yet judged correctly. The admin reviews it there and publishes it
 * from there, through the path that already exists.
 *
 * Only possible while the scan is still in R2. The sweep runs first so the
 * decision is made against a swept database rather than a stale one — an admin
 * sitting on the rejected list since before the deadline would otherwise be
 * offered a restore that the next page load would have withdrawn.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  await purgeExpiredRejectionsQuietly(event);

  const db = useDb(event);

  const row = await db
    .select({
      id: schema.restrooms.id,
      status: schema.restrooms.status,
      rejectedAt: schema.restrooms.rejectedAt,
      scanPurgedAt: schema.restrooms.scanPurgedAt,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.id, id))
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  // A banned submitter's entries all sit at `hidden`, carrying the status they
  // will return to in `pre_ban_status`. Restoring one from here would strand
  // that value and un-hide an entry the ban is supposed to be hiding, so the
  // ban has to be lifted first.
  if (row.status !== "rejected") {
    throw createError({
      statusCode: 409,
      statusMessage:
        row.status === "hidden"
          ? "This entry is hidden by a ban on its submitter. Lift the ban first."
          : "Only a rejected submission can be restored.",
    });
  }

  // Not a clock check. `rejected_at` being null means the entry was rejected
  // before scans were kept at all, and `scan_purged_at` being set means the
  // sweep has been through — either way the model is gone and restoring would
  // produce a listing with nothing behind it.
  if (!row.rejectedAt || row.scanPurgedAt) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This rejection can no longer be undone: the scan has been deleted.",
    });
  }

  await db
    .update(schema.restrooms)
    .set({
      status: "pending",
      // Both cleared because the entry is no longer rejected: the message would
      // otherwise still be showing in the submitter's list, and a stale
      // `rejected_at` would leave the sweep counting down on a pending entry.
      rejectionMessage: null,
      rejectedAt: null,
      updatedAt: now(),
    })
    .where(eq(schema.restrooms.id, id));

  await recordAdminAction(event, "restroom.unreject", "restroom", id);

  return { ok: true };
});
