import { and, eq, inArray } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { parseDescriptors } from "~~/server/utils/descriptors";
import { getRouterString } from "~~/server/utils/routeParams";
import { versionedThumbUrl } from "~~/server/utils/urls";
import { parseCrop } from "~~/shared/utils/crop";

export default defineEventHandler(async (event) => {
  const slug = getRouterString(event, "slug");

  const db = useDb(event);
  const isAdmin = event.context.user?.role === "admin";
  const statuses = isAdmin ? ["published", "pending"] : ["published"];

  const row = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      country: schema.restrooms.country,
      establishment: schema.restrooms.establishment,
      lat: schema.restrooms.lat,
      lng: schema.restrooms.lng,
      date: schema.restrooms.date,
      isoDate: schema.restrooms.isoDate,
      description: schema.restrooms.description,
      descriptors: schema.restrooms.descriptors,
      file: schema.restrooms.file,
      thumbKey: schema.restrooms.thumbKey,
      status: schema.restrooms.status,
      updatedAt: schema.restrooms.updatedAt,
      crop: schema.restrooms.crop,
      submitterUsername: schema.users.username,
      submitterDisplayName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.submittedBy, schema.users.id))
    .where(
      and(
        eq(schema.restrooms.slug, slug),
        inArray(schema.restrooms.status, statuses),
      ),
    )
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    location: row.location,
    country: row.country,
    // Falls back to the row's own slug, which is what 0031 backfilled: a row
    // with no key is a place with one scan.
    establishment: row.establishment ?? row.slug,
    lat: row.lat,
    lng: row.lng,
    date: row.date,
    isoDate: row.isoDate,
    description: row.description,
    descriptors: parseDescriptors(row.descriptors),
    submitter: row.submitterUsername
      ? {
          username: row.submitterUsername,
          displayName: row.submitterDisplayName,
        }
      : null,
    status: row.status,
    crop: parseCrop(row.crop),
    modelUrl: `/api/r2/models/${row.file}`,
    thumbUrl: versionedThumbUrl(row.thumbKey, row.updatedAt),
  };
});
