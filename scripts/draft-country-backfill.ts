/**
 * Drafts the country backfill for entries that predate the `country` column.
 *
 * One-time tooling. It reads a dump of the distinct locations in the catalog,
 * guesses a country for each (scripts/infer-country.ts), and prints both a
 * review table and the SQL to apply. The guess is a draft: every line marked
 * `CHECK` rests on something the stored data cannot settle, and the whole
 * point of the column is to stop shipping numbers that rest on those. Read the
 * table, fix what is wrong, then paste the SQL into the 0028 migration.
 *
 *   npx wrangler d1 execute restroom-archive-db --remote --json \
 *     --command "SELECT location, COUNT(*) AS n,
 *                       SUM(status = 'published') AS published,
 *                       MIN(lat) AS lat, MIN(lng) AS lng
 *                FROM restrooms GROUP BY location ORDER BY location" \
 *     > /tmp/locations.json
 *   npm run db:draft-backfill /tmp/locations.json
 *
 * Every row is backfilled, not just published ones: a pending entry becomes a
 * published one later, and /api/stats stops reporting a country count the
 * moment a published row has no country.
 *
 * The published count is carried through and reported separately because only
 * published entries reach the About page, and the two totals differ. A country
 * whose only entries were rejected is in this table but not in the figure the
 * site prints -- a distinction easy to miss, and one that made an earlier read
 * of this output claim a country the archive does not actually show.
 */
import { readFileSync } from "node:fs";
import { draftCountry } from "./infer-country";
import { COUNTRIES, countryName } from "../shared/utils/regions";

interface Place {
  location: string;
  n?: number;
  /** How many of `n` are published. Absent in a dump taken without it. */
  published?: number;
  lat: number | null;
  lng: number | null;
}

const KNOWN = new Set(COUNTRIES.map((c) => c.code));

/** wrangler --json wraps results in [{ results: [...] }]; a hand-made dump may not. */
function readPlaces(path: string): Place[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const rows = Array.isArray(raw)
    ? ((raw[0] as { results?: unknown })?.results ?? raw)
    : ((raw as { results?: unknown }).results ?? []);
  if (!Array.isArray(rows)) throw new Error("Could not find a results array");
  return rows as Place[];
}

function sqlQuote(s: string) {
  return `'${s.replace(/'/g, "''")}'`;
}

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run db:draft-backfill <locations.json>");
  process.exit(1);
}

const places = readPlaces(path);
const drafts = places.map((p) => ({
  ...p,
  ...draftCountry(p.location, p.lat ?? null, p.lng ?? null, (c) =>
    KNOWN.has(c),
  ),
}));

const unsure = drafts.filter((d) => !d.sure);
const width = Math.max(...drafts.map((d) => d.location.length), 8);

const hasStatus = drafts.some((d) => d.published != null);

console.error("\nDrafted countries\n");
if (hasStatus) console.error(`${" ".repeat(width + 7)}all  pub\n`);
for (const d of drafts) {
  const label = countryName(d.country) ?? "(unknown)";
  const mark = d.sure ? "  ok  " : " CHECK";
  const count = d.n != null ? String(d.n).padStart(3) : "  ?";
  // A location with nothing published is backfilled like any other, but it is
  // not part of any figure the site shows, so it is worth less of a reviewer's
  // attention than the row count alone suggests.
  const pub = hasStatus ? `  ${String(d.published ?? 0).padStart(3)}` : "";
  const note = hasStatus && !d.published ? "  (none published)" : "";
  console.error(
    `${mark} ${d.location.padEnd(width)}  ${count}${pub}  ${d.country}  ${label}${note}`,
  );
}

if (unsure.length) {
  console.error(`\n${unsure.length} to check by hand:\n`);
  for (const d of unsure) console.error(`  ${d.location}\n    ${d.why}\n`);
}

const countries = new Set(drafts.map((d) => d.country));
console.error(
  `${drafts.length} locations, ${countries.size} distinct countries as drafted.`,
);

// The figures the About page will actually print, which are the only ones
// worth checking a drafted country against.
if (hasStatus) {
  const shown = drafts.filter((d) => (d.published ?? 0) > 0);
  const shownCountries = new Set(shown.map((d) => d.country));
  const entries = shown.reduce((sum, d) => sum + (d.published ?? 0), 0);
  console.error(
    `Published only -- what the About page shows: ${entries} entries, ` +
      `${shown.length} cities, ${shownCountries.size} countries.`,
  );
  const hidden = [...countries].filter((c) => !shownCountries.has(c));
  if (hidden.length)
    console.error(
      `Present only in unpublished entries, and so absent from that count: ${hidden.join(", ")}.`,
    );
}

console.error(`\nFix anything marked CHECK before using the SQL below.\n`);

// stdout is only the SQL, so it can be redirected straight into the migration.
console.log(
  "-- Drafted by scripts/draft-country-backfill.ts and reviewed by hand.",
);
for (const d of drafts) {
  const flag = d.sure ? "" : `  -- CHECK: ${d.why}`;
  console.log(
    `UPDATE restrooms SET country = ${sqlQuote(d.country)} WHERE location = ${sqlQuote(d.location)};${flag}`,
  );
}
