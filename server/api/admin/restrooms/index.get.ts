import { eq, asc } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { parseDescriptors } from "~~/server/utils/descriptors";
import { purgeExpiredRejectionsQuietly } from "~~/server/utils/purgeRejections";
import { cropFromColumns } from "~~/shared/utils/crop";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  // Rides along here as well as on the rejected list, because Pages has no cron
  // and this is the endpoint an admin hits most: it backs a tab badge, so it
  // loads whenever an admin opens their account page. Expiry therefore happens
  // on ordinary traffic instead of waiting for someone to open the rejected
  // section, which may be never.
  await purgeExpiredRejectionsQuietly(event);

  const db = useDb(event);

  const rows = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      date: schema.restrooms.date,
      isoDate: schema.restrooms.isoDate,
      lat: schema.restrooms.lat,
      lng: schema.restrooms.lng,
      description: schema.restrooms.description,
      descriptors: schema.restrooms.descriptors,
      file: schema.restrooms.file,
      createdAt: schema.restrooms.createdAt,
      cropMinX: schema.restrooms.cropMinX,
      cropMinY: schema.restrooms.cropMinY,
      cropMinZ: schema.restrooms.cropMinZ,
      cropMaxX: schema.restrooms.cropMaxX,
      cropMaxY: schema.restrooms.cropMaxY,
      cropMaxZ: schema.restrooms.cropMaxZ,
      submitterEmail: schema.users.email,
      submitterUsername: schema.users.username,
      submitterName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.submittedBy, schema.users.id))
    .where(eq(schema.restrooms.status, "pending"))
    .orderBy(asc(schema.restrooms.createdAt))
    .all();

  return rows.map((r) => ({
    ...r,
    descriptors: parseDescriptors(r.descriptors),
    // A pending entry can already carry a crop: an admin reviewing one can trim
    // it before publishing rather than noticing the stray geometry afterwards.
    crop: cropFromColumns(r),
    modelUrl: `/api/r2/models/${r.file}`,
    submitter: r.submitterEmail
      ? {
          email: r.submitterEmail,
          username: r.submitterUsername,
          displayName: r.submitterName,
        }
      : null,
  }));
});
