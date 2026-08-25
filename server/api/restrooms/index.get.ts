import { desc, eq, inArray } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { parseDescriptors } from "~~/server/utils/descriptors";

export default defineEventHandler(async (event) => {
  const db = useDb(event);

  // Admins also see pending entries so they can preview them via /r/<slug>
  // — same rendering path as published models, just hidden from the directory
  // for everyone else by client-side filtering.
  const isAdmin = event.context.user?.role === "admin";
  const statuses = isAdmin ? ["published", "pending"] : ["published"];

  const rows = await db
    .select({
      id: schema.restrooms.id,
      slug: schema.restrooms.slug,
      name: schema.restrooms.name,
      location: schema.restrooms.location,
      coords: schema.restrooms.coords,
      lat: schema.restrooms.lat,
      lng: schema.restrooms.lng,
      date: schema.restrooms.date,
      isoDate: schema.restrooms.isoDate,
      description: schema.restrooms.description,
      descriptors: schema.restrooms.descriptors,
      file: schema.restrooms.file,
      thumbKey: schema.restrooms.thumbKey,
      status: schema.restrooms.status,
      submitterUsername: schema.users.username,
      submitterDisplayName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.submittedBy, schema.users.id))
    .where(inArray(schema.restrooms.status, statuses))
    .orderBy(desc(schema.restrooms.isoDate))
    .all();

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    location: r.location,
    coords: r.coords,
    lat: r.lat,
    lng: r.lng,
    date: r.date,
    isoDate: r.isoDate,
    description: r.description,
    descriptors: parseDescriptors(r.descriptors),
    submitter: r.submitterUsername
      ? { username: r.submitterUsername, displayName: r.submitterDisplayName }
      : null,
    status: r.status,
    // Relative URLs — resolved against document.baseURI on the client.
    // Avoids SSR-time host confusion (Nitro internal fetch reports localhost).
    modelUrl: `/api/r2/models/${r.file}`,
    thumbUrl: r.thumbKey ? `/api/r2/thumbs/${r.thumbKey}` : null,
  }));
});
