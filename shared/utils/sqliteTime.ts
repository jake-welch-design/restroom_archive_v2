/**
 * Parsing for the timestamp format SQLite's `datetime('now')` produces.
 *
 * Lives in shared/ because both halves of the application need it: the server
 * compares stored mute and message timestamps against the clock, and the client
 * does the same to decide whether to show a suspension banner. Two copies of
 * this parse previously disagreed about nothing, but only by luck.
 */

/**
 * Converts a SQLite UTC timestamp to epoch milliseconds, or null if it is
 * absent or unparseable.
 *
 * `datetime('now')` yields `YYYY-MM-DD HH:MM:SS` with no timezone marker.
 * Passing that straight to `Date.parse` is host-dependent: the space-separated
 * form is not an ISO 8601 date-time, so engines fall back to implementation
 * behaviour and Node reads it as local time. Substituting `T` for the space and
 * appending `Z` makes it unambiguously ISO and unambiguously UTC, which is what
 * the value actually is.
 */
export function parseSqliteUtc(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** True if `value` is a valid timestamp less than `hours` in the past. */
export function isWithinHours(
  value: string | null | undefined,
  hours: number,
): boolean {
  const ms = parseSqliteUtc(value);
  if (ms == null) return false;
  return Date.now() - ms < hours * 60 * 60 * 1000;
}

/** True if `value` is a valid timestamp that has not yet been reached. */
export function isFuture(value: string | null | undefined): boolean {
  const ms = parseSqliteUtc(value);
  return ms != null && ms > Date.now();
}
