// SQLite's datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC, with no
// timezone marker. Parsing those strings directly via Date() varies by host
// (Node treats them as local). Normalize by appending the UTC marker.
export function parseSqliteUtc(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function isWithinHours(
  value: string | null | undefined,
  hours: number,
): boolean {
  const ms = parseSqliteUtc(value);
  if (ms == null) return false;
  return Date.now() - ms < hours * 60 * 60 * 1000;
}
