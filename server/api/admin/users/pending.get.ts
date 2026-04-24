import { asc, isNull } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const db = useDb(event)

  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(isNull(schema.users.approvedAt))
    .orderBy(asc(schema.users.createdAt))
    .all()

  return rows
})
