import { eq, isNull, and, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";

// Public running totals for the closing sentence of the About page's bio.
// Cheap aggregate counts rather than shipping the full restroom/user lists just
// to measure them client-side.
//
// All the counts come off the published rows, so the archivist count is people
// whose work is actually in the catalog -- not everyone who holds an account.
// That also handles bans for free: a banned submitter's entries are pulled out
// of "published", so they drop out of the count with them. Entries with no
// submitter (NULL `submitted_by`) credit nobody and are skipped by
// `count(distinct ...)`.
export default defineEventHandler(async (event) => {
  const db = useDb(event);

  const row = await db
    .select({
      n: sql<number>`count(*)`,
      cities: sql<number>`count(distinct ${schema.restrooms.location})`,
      countries: sql<number>`count(distinct ${schema.restrooms.country})`,
      archivists: sql<number>`count(distinct ${schema.restrooms.submittedBy})`,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.status, "published"))
    .get();

  // A country count is only publishable if every published entry has one.
  // `count(distinct country)` silently skips NULLs, so a half-backfilled
  // catalog would produce a confident number that is simply too low -- exactly
  // the kind of wrong figure this column was added to stop. One unassigned row
  // and the About page drops the clause instead, saying less rather than
  // something untrue.
  const unassigned = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.restrooms)
    .where(
      and(
        eq(schema.restrooms.status, "published"),
        isNull(schema.restrooms.country),
      ),
    )
    .get();

  const countable = Number(unassigned?.n ?? 1) === 0;

  return {
    restrooms: Number(row?.n ?? 0),
    cities: Number(row?.cities ?? 0),
    countries: countable ? Number(row?.countries ?? 0) : null,
    archivists: Number(row?.archivists ?? 0),
  };
});
