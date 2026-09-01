import { desc, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { getRouterId } from "~~/server/utils/routeParams";

/**
 * One account's submissions, for the dropdown on its row in Accounts.
 *
 * Every status, newest first: an admin looking at an account wants the whole
 * history, including what was rejected or taken down. Fetched only when a row
 * is expanded, which is why the count and the list are separate requests.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const db = useDb(event);

  return await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      date: schema.restrooms.date,
      status: schema.restrooms.status,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.submittedBy, id))
    .orderBy(desc(schema.restrooms.createdAt))
    .all();
});
