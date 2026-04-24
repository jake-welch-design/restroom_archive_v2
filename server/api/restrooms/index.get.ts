import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { parseDescriptors } from '~~/server/utils/descriptors'

export default defineEventHandler(async (event) => {
  const db = useDb(event)

  const rows = await db
    .select()
    .from(schema.restrooms)
    .where(eq(schema.restrooms.status, 'published'))
    .orderBy(desc(schema.restrooms.isoDate))
    .all()

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
    attribution: r.attribution,
    status: r.status,
    // Relative URLs — resolved against document.baseURI on the client.
    // Avoids SSR-time host confusion (Nitro internal fetch reports localhost).
    modelUrl: `/api/r2/models/${r.file}`,
    thumbUrl: r.thumbKey ? `/api/r2/thumbs/${r.thumbKey}` : null,
  }))
})
