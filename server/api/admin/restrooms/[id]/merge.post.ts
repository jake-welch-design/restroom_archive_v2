import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { serializeDescriptors } from "~~/server/utils/descriptors";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

/**
 * Merges this scan's catalog entry into another, so the other gains its
 * archive dates. See migrations/0031_restroom_versions.sql.
 *
 * The whole entry moves, not only this scan: an entry that already holds
 * several dates keeps them together. The tags and coordinates the admin
 * settled on in the merge dialog are then written to every scan of the merged
 * entry, so its pin sits in one place and a tag filter finds it whichever date
 * is showing. Descriptions are left alone; they are each scan's own.
 */
const Body = z.object({
  /** The establishment key of the entry being merged into. */
  into: z.string().min(1).max(200),
  descriptors: z.array(z.string().min(1).max(40)).max(30),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

/** The display string stored alongside lat/lng, as submit and edit write it. */
function formatCoords(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return "";
  return `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)} ${lng >= 0 ? "E" : "W"}`;
}

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const id = getRouterId(event);
  const body = await readValidatedBody(event, Body.parse);

  if ((body.lat == null) !== (body.lng == null))
    throw createError({
      statusCode: 422,
      statusMessage: "Give both a latitude and a longitude, or neither.",
    });

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

  const from = row.establishment ?? row.slug;
  if (body.into === from)
    throw createError({
      statusCode: 422,
      statusMessage: "This scan is already part of that entry.",
    });

  // Only into an entry the public can already see. A key nobody published
  // holds is a typo, or an entry still waiting in the queue.
  const target = await db
    .select({ id: schema.restrooms.id })
    .from(schema.restrooms)
    .where(
      and(
        eq(schema.restrooms.establishment, body.into),
        eq(schema.restrooms.status, "published"),
      ),
    )
    .get();
  if (!target)
    throw createError({
      statusCode: 422,
      statusMessage: "No published entry to merge into.",
    });

  // One batch, so D1's implicit transaction never leaves the entry moved but
  // still carrying its old tags and pin. In order: the move first, so the
  // second statement reaches the moved scans as well as the target's own.
  await db.batch([
    db
      .update(schema.restrooms)
      .set({ establishment: body.into, updatedAt: now() })
      .where(eq(schema.restrooms.establishment, from)),
    db
      .update(schema.restrooms)
      .set({
        descriptors: serializeDescriptors(body.descriptors),
        lat: body.lat,
        lng: body.lng,
        coords: formatCoords(body.lat, body.lng),
        updatedAt: now(),
      })
      .where(eq(schema.restrooms.establishment, body.into)),
  ]);

  await recordAdminAction(event, "restroom.merge", "restroom", id, {
    from,
    into: body.into,
  });

  return { ok: true };
});
