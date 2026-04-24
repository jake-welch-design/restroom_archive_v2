import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { parseDescriptors } from '~~/server/utils/descriptors'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)

  const row = await db
    .select()
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    location: row.location,
    coords: row.coords,
    lat: row.lat,
    lng: row.lng,
    date: row.date,
    isoDate: row.isoDate,
    description: row.description,
    descriptors: parseDescriptors(row.descriptors),
    attribution: row.attribution,
    status: row.status,
    modelUrl: `/api/r2/models/${row.file}`,
    thumbUrl: row.thumbKey ? `/api/r2/thumbs/${row.thumbKey}` : null,
  }
})
