import type { H3Event } from "h3";
import { and, isNull, isNotNull, inArray, lte, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { deleteRestroomBlobs, hasBlobBindings } from "~~/server/utils/r2";
import { now } from "~~/server/utils/sqlTime";
import { REJECTION_GRACE_DAYS } from "~~/shared/utils/rejection";

/**
 * Most entries one sweep will purge.
 *
 * The sweep hangs off ordinary admin requests, so it has to be bounded: a
 * backlog must not turn one queue fetch into hundreds of R2 round trips. It
 * runs on every admin queue load, so anything left over goes on the next one.
 */
const SWEEP_LIMIT = 50;

/**
 * Deletes the scans of rejections whose grace period has run out.
 *
 * This runs on request rather than on a schedule because the application is
 * deployed to Cloudflare Pages, which has no cron triggers. The same trick the
 * rate limiter uses — cleanup rides along on traffic — except this one is
 * deterministic rather than probabilistic, and attached to admin endpoints, so
 * an admin looking at the rejected list is always looking at a swept one.
 *
 * Keyed on `rejected_at` alone, deliberately not on `status = 'rejected'`. A
 * banned submitter's entries are all moved to `hidden`, so a status filter
 * would let a rejected entry escape the sweep for as long as the ban lasts and
 * keep its blobs indefinitely.
 *
 * The row itself is never deleted. It carries the rejection message the
 * submitter sees in their own list, which has to outlive the scan.
 *
 * @returns how many entries were purged.
 */
export async function purgeExpiredRejections(event: H3Event): Promise<number> {
  // Without the buckets the deletes below do nothing, and marking the rows
  // purged would be a lie that permanently blocks a restore of a scan that is
  // still there. Local runs simply do not sweep.
  if (!hasBlobBindings(event)) return 0;

  const db = useDb(event);

  // Both sides are SQLite's `YYYY-MM-DD HH:MM:SS` UTC, which is fixed-width and
  // big-endian, so a string comparison is a chronological one. Evaluated by the
  // database rather than the worker for the reason sqlTime.ts gives: an edge
  // node's clock does not get to decide when someone's scan is deleted.
  const expired = await db
    .select({
      id: schema.restrooms.id,
      file: schema.restrooms.file,
      thumbKey: schema.restrooms.thumbKey,
    })
    .from(schema.restrooms)
    .where(
      and(
        isNotNull(schema.restrooms.rejectedAt),
        isNull(schema.restrooms.scanPurgedAt),
        lte(
          schema.restrooms.rejectedAt,
          sql`datetime('now', ${`-${REJECTION_GRACE_DAYS} days`})`,
        ),
      ),
    )
    .limit(SWEEP_LIMIT)
    .all();

  if (!expired.length) return 0;

  // `deleteRestroomBlobs` never rejects, so this settles whatever the state of
  // each individual object.
  await Promise.all(expired.map((row) => deleteRestroomBlobs(event, row)));

  // Marking them is what keeps the sweep idempotent: without it every later
  // sweep would re-issue deletes for every rejection ever expired, and the
  // working set would only ever grow.
  await db
    .update(schema.restrooms)
    .set({ scanPurgedAt: now() })
    .where(
      inArray(
        schema.restrooms.id,
        expired.map((row) => row.id),
      ),
    );

  return expired.length;
}

/**
 * The sweep, for callers that must not fail because of it.
 *
 * The queue endpoints run this so expiry happens on ordinary admin traffic, and
 * for them a sweep that throws — a transient D1 error, say — is no reason to
 * refuse to render the queue. The blobs stay another few minutes and the next
 * request tries again.
 */
export async function purgeExpiredRejectionsQuietly(event: H3Event) {
  try {
    await purgeExpiredRejections(event);
  } catch (err) {
    console.error("rejection sweep failed", err);
  }
}
