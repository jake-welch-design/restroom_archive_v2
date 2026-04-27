import { asc, eq, isNotNull } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

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
      status: schema.restrooms.status,
      removalReason: schema.restrooms.removalReason,
      requesterEmail: schema.users.email,
      requesterUsername: schema.users.username,
      requesterName: schema.users.displayName,
    })
    .from(schema.restrooms)
    .leftJoin(schema.users, eq(schema.restrooms.removalRequestedBy, schema.users.id))
    .where(isNotNull(schema.restrooms.removalRequestedBy))
    .orderBy(asc(schema.restrooms.updatedAt))
    .all()

  return rows.map(r => ({
    ...r,
    requester: r.requesterEmail
      ? { email: r.requesterEmail, username: r.requesterUsername, displayName: r.requesterName }
      : null,
  }))
})
