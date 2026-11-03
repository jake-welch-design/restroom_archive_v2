import { and, asc, eq, ne } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

/**
 * Takes one scan back out of a combined entry, making it an entry of its own.
 * The undo for a merge, one date at a time. Tags and coordinates stay as the
 * merge left them; the scan can be edited afterwards like any other.
 *
 * An entry's key is the slug of one of its scans, usually its first. When that
 * is the scan leaving, the key leaves with it -- it is that scan's own slug --
 * so the scans staying behind are rekeyed to one of their own.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const id = getRouterId(event);
  const db = useDb(event);

  const row = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      establishment: schema.restrooms.establishment,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.id, id))
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  const key = row.establishment ?? row.slug;
  const remaining = await db
    .select({ slug: schema.restrooms.slug })
    .from(schema.restrooms)
    .where(
      and(
        eq(schema.restrooms.establishment, key),
        ne(schema.restrooms.id, row.id),
      ),
    )
    .orderBy(asc(schema.restrooms.isoDate), asc(schema.restrooms.id))
    .all();

  if (!remaining.length)
    throw createError({
      statusCode: 422,
      statusMessage: "This scan is not part of a combined entry.",
    });

  if (key === row.slug) {
    await db
      .update(schema.restrooms)
      .set({ establishment: remaining[0].slug, updatedAt: now() })
      .where(
        and(
          eq(schema.restrooms.establishment, key),
          ne(schema.restrooms.id, row.id),
        ),
      );
  } else {
    await db
      .update(schema.restrooms)
      .set({ establishment: row.slug, updatedAt: now() })
      .where(eq(schema.restrooms.id, row.id));
  }

  await recordAdminAction(event, "restroom.separate", "restroom", id, {
    from: key,
  });

  return { ok: true };
});
