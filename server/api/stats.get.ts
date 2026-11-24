import { eq, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";

// Public running totals for the closing sentence of the About page's bio.
// Cheap aggregate counts rather than shipping the full restroom/user lists just
// to measure them client-side.
//
// All the counts come off the published rows, so the archivist count is people
// whose work is actually in the catalog, not everyone who holds an account.
// That also handles bans for free: a banned submitter's entries are pulled out
// of "published", so they drop out of the count with them. Entries with no
// submitter (NULL `submitted_by`) credit nobody and are skipped by
// `count(distinct ...)`.
export default defineEventHandler(async (event) => {
  const db = useDb(event);

  const row = await db
    .select({
      // Restrooms, not scans: a merged entry is one restroom however many
      // archive dates it holds. `establishment` is NULL only on a row predating
      // migration 0031, which is then an entry of its own, keyed by its slug.
      n: sql<number>`count(distinct coalesce(${schema.restrooms.establishment}, ${schema.restrooms.slug}))`,
      cities: sql<number>`count(distinct ${schema.restrooms.location})`,
      countries: sql<number>`count(distinct ${schema.restrooms.country})`,
      archivists: sql<number>`count(distinct ${schema.restrooms.submittedBy})`,
      // A country count is only publishable if every published entry has one.
      // `count(distinct country)` skips NULLs, so one unassigned row drops the
      // clause altogether rather than publishing a figure that is too low.
      unassigned: sql<number>`coalesce(sum(${schema.restrooms.country} is null), 0)`,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.status, "published"))
    .get();

  const countable = Number(row?.unassigned ?? 1) === 0;

  setHeader(
    event,
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300",
  );

  return {
    restrooms: Number(row?.n ?? 0),
    cities: Number(row?.cities ?? 0),
    countries: countable ? Number(row?.countries ?? 0) : null,
    archivists: Number(row?.archivists ?? 0),
  };
});
