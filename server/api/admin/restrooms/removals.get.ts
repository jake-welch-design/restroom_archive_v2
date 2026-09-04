import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

/**
 * Submitters asking for their own entry to be taken down.
 *
 * A request leaves this queue in one of two ways: dismissed, which clears
 * `removal_requested_by`, or granted, which sets the status to `removed` and
 * leaves that column standing as the record of who asked. Hence both
 * conditions — neither alone describes an open request.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const db = useDb(event);

  const rows = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      date: schema.restrooms.date,
      status: schema.restrooms.status,
      removalReason: schema.restrooms.removalReason,
      requesterEmail: schema.users.email,
      requesterUsername: schema.users.username,
      requesterName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(
      schema.users,
      eq(schema.restrooms.removalRequestedBy, schema.users.id),
    )
    .where(
      and(
        isNotNull(schema.restrooms.removalRequestedBy),
        ne(schema.restrooms.status, "removed"),
      ),
    )
    .orderBy(asc(schema.restrooms.updatedAt))
    .all();

  return rows.map((r) => ({
    ...r,
    requester: r.requesterEmail
      ? {
          email: r.requesterEmail,
          username: r.requesterUsername,
          displayName: r.requesterName,
        }
      : null,
  }));
});
