import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'
import { serializeDescriptors } from '~~/server/utils/descriptors'

const Body = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  isoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  descriptors: z.array(z.string().min(1).max(40)).max(30).optional(),
})

function formatDisplayDate(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = d.getUTCFullYear()
  return `${day} ${month} ${year}`
}

// Admins can edit any entry; archivists can edit the info on their own
// submissions. Banned/muted accounts are blocked by requireActiveUser.
export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  const row = await db
    .select({ id: schema.restrooms.id, submittedBy: schema.restrooms.submittedBy })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  if (row.submittedBy !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'You can only edit your own submissions.' })
  }

  const coords = (body.lat != null && body.lng != null)
    ? `${Math.abs(body.lat).toFixed(2)} ${body.lat >= 0 ? 'N' : 'S'}, ${Math.abs(body.lng).toFixed(2)} ${body.lng >= 0 ? 'E' : 'W'}`
    : ''

  await db
    .update(schema.restrooms)
    .set({
      name: body.name,
      location: body.location,
      date: formatDisplayDate(body.isoDate),
      isoDate: body.isoDate,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      coords,
      description: body.description ?? null,
      descriptors: serializeDescriptors(body.descriptors),
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.restrooms.id, row.id))

  return { ok: true }
})
