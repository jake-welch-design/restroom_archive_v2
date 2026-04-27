import { eq, asc } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { parseDescriptors } from '~~/server/utils/descriptors'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const db = useDb(event)

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
      submitterEmail: schema.users.email,
      submitterUsername: schema.users.username,
      submitterName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.submittedBy, schema.users.id))
    .where(eq(schema.restrooms.status, 'pending'))
    .orderBy(asc(schema.restrooms.createdAt))
    .all()

  return rows.map(r => ({
    ...r,
    descriptors: parseDescriptors(r.descriptors),
    modelUrl: `/api/r2/models/${r.file}`,
    submitter: r.submitterEmail
      ? { email: r.submitterEmail, username: r.submitterUsername, displayName: r.submitterName }
      : null,
  }))
})
