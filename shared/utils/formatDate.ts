/**
 * Date formatting for everything the interface displays.
 *
 * Two output styles cover the whole application, and both accept either of the
 * two string shapes the database stores: a date-only `YYYY-MM-DD` (a scan's
 * `isoDate`) or a SQLite UTC timestamp `YYYY-MM-DD HH:MM:SS` (any `createdAt`).
 *
 * Consolidates eight separate definitions that had accumulated across the
 * catalog views and the account page. Four of them were byte-identical copies;
 * the rest differed in ways that were not deliberate. See `toUtcDate` for the
 * one behavioural correction this consolidation makes.
 */

/**
 * Parses either stored date shape as UTC, returning null when the value is
 * absent or unrecognised.
 *
 * Both shapes need normalising before `Date.parse` will read them as UTC:
 *
 * - `YYYY-MM-DD` is parsed as UTC midnight by the spec, but only because it is
 *   date-only. Making the time and zone explicit removes the reliance on that.
 * - `YYYY-MM-DD HH:MM:SS` is not ISO 8601 at all, because of the space. Engines
 *   fall back to implementation behaviour there, and browsers read it as local
 *   time.
 *
 * That second case is the correction. Annotation timestamps were previously
 * parsed as local and then formatted with `timeZone: "UTC"`, so a comment
 * created late in the evening west of Greenwich, or early in the morning east
 * of it, displayed the neighbouring day.
 */
function toUtcDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  let normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = `${normalized}T00:00:00Z`;
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    normalized = `${normalized.replace(" ", "T")}Z`;
  }

  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * `05 Mar 2025`. The archive's primary date style, used wherever a scan's own
 * date is shown: list rows, grid tiles, the map panel, and the admin queues.
 *
 * Returns the input unchanged if it cannot be parsed, so an unexpected value
 * surfaces as itself rather than as "Invalid Date".
 */
export function formatDayMonthYear(value: string | null | undefined): string {
  const date = toUtcDate(value);
  if (!date) return value ?? "";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/**
 * `Mar 5, 2025`. Used for author-and-date bylines on annotations, where the
 * date is secondary to the text beside it and the leading zero reads as noise.
 */
export function formatMonthDayYear(value: string | null | undefined): string {
  const date = toUtcDate(value);
  if (!date) return value ?? "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
