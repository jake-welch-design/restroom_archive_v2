/**
 * Grouping scans into catalog entries.
 *
 * An entry is a place, archived by name and location, and every scan of it
 * shares an `establishment` key. Most entries are a single scan. One that an
 * admin has combined holds several, which the catalog offers as archive dates
 * on the one entry. See migrations/0031_restroom_versions.sql.
 *
 * Scans are ordered by capture date, so the latest is the most recent scan of
 * the place rather than the most recent submission of it.
 */

export interface Groupable {
  id: number;
  slug: string;
  establishment: string;
  isoDate: string;
}

function byCapture(a: Groupable, b: Groupable) {
  // Ties fall back to id, so two scans from one day keep the order they were
  // submitted in.
  return a.isoDate.localeCompare(b.isoDate) || a.id - b.id;
}

/**
 * Scans grouped into entries by establishment, each entry's scans oldest
 * first. Entries come out in the order their first scan appears in `list`.
 */
export function groupEntries<T extends Groupable>(
  list: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const r of list) {
    const group = groups.get(r.establishment);
    if (group) group.push(r);
    else groups.set(r.establishment, [r]);
  }
  for (const group of groups.values()) group.sort(byCapture);
  return groups;
}

/** The newest scan of each entry, one per place (e.g. for the Random pick). */
export function latestPerEntry<T extends Groupable>(list: readonly T[]): T[] {
  return [...groupEntries(list).values()].map((g) => g[g.length - 1]);
}
