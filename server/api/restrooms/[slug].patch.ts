import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { serializeDescriptors } from "~~/server/utils/descriptors";
import { getRouterString } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";
import { formatCoords, isCountryCode } from "~~/shared/utils/regions";

const Body = z
  .object({
    name: z.string().min(1).max(200),
    location: z.string().min(1).max(200),
    // As in submit.post.ts: a code from the shared list, never read back out of
    // `location`. Optional so a caller can leave the stored country alone, and
    // deliberately not nullable because a row published without a country drops
    // the count from the About page.
    country: z
      .string()
      .refine(isCountryCode, "Please choose a country from the list")
      .optional(),
    isoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    description: z.string().max(1000).nullable().optional(),
    descriptors: z.array(z.string().min(1).max(40)).max(30).optional(),
  })
  .refine((d) => (d.lat == null) === (d.lng == null), {
    message: "Give both a latitude and a longitude, or neither.",
  });

// Admins can edit any entry; archivists can edit the info on their own
// submissions. Banned/muted accounts are blocked by requireActiveUser.
export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);

  const slug = getRouterString(event, "slug");

  const body = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const row = await db
    .select({
      id: schema.restrooms.id,
      submittedBy: schema.restrooms.submittedBy,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  if (row.submittedBy !== user.id && user.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only edit your own submissions.",
    });
  }

  await db
    .update(schema.restrooms)
    .set({
      name: body.name,
      location: body.location,
      ...(body.country !== undefined ? { country: body.country } : {}),
      date: formatDayMonthYear(body.isoDate),
      isoDate: body.isoDate,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      coords: formatCoords(body.lat, body.lng),
      description: body.description ?? null,
      descriptors: serializeDescriptors(body.descriptors),
      updatedAt: now(),
    })
    .where(eq(schema.restrooms.id, row.id));

  return { ok: true };
});
