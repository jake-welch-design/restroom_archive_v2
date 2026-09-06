/**
 * The window in which a rejection can still be taken back.
 *
 * Lives in shared/ for the same reason sqliteTime.ts does: the server sweeps
 * expired rejections against this number and the admin interface counts down
 * against it, and two copies would eventually disagree about how long an admin
 * actually has.
 */
import { parseSqliteUtc } from "./sqliteTime";

/**
 * Days a rejected entry's scan is kept before the sweep deletes it.
 *
 * Changing this moves the deadline for every rejection already on the clock,
 * including ones past the old window that have not been swept yet. Lengthening
 * it is therefore safe; shortening it retroactively expires entries an admin
 * may currently see as restorable.
 */
export const REJECTION_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Milliseconds left before the scan is eligible for deletion, or null when
 * `rejectedAt` is absent or unparseable.
 *
 * Goes negative once the window has passed, which is not the same as the scan
 * being gone: the sweep is what actually deletes it, and until it has run the
 * blobs are still there. Callers deciding whether a restore is possible must
 * read `scanPurgedAt`, not this. This is for display.
 */
export function rejectionMsLeft(
  rejectedAt: string | null | undefined,
  from: number = Date.now(),
): number | null {
  const ms = parseSqliteUtc(rejectedAt);
  if (ms == null) return null;
  return ms + REJECTION_GRACE_DAYS * DAY_MS - from;
}

/**
 * The countdown as an admin reads it.
 *
 * Coarse on purpose. Days while there are days, hours in the last stretch when
 * the difference starts to matter, and no minute-by-minute precision that would
 * imply the deadline is enforced to the second — the sweep runs when an admin
 * loads the queue, so the real cutoff is "the next time somebody looks".
 */
export function formatRejectionCountdown(msLeft: number): string {
  if (msLeft <= 0) return "Expired";

  const hours = msLeft / (60 * 60 * 1000);
  if (hours < 1) return "Under an hour left";
  if (hours < 48) {
    const h = Math.floor(hours);
    return `${h} hour${h === 1 ? "" : "s"} left`;
  }

  const days = Math.floor(msLeft / DAY_MS);
  return `${days} days left`;
}
