import { and, asc, isNotNull, isNull } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const db = useDb(event)

  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      displayName: schema.users.displayName,
      createdAt: schema.users.createdAt,
      submissionRequestedAt: schema.users.submissionRequestedAt,
    })
    .from(schema.users)
    .where(and(isNotNull(schema.users.submissionRequestedAt), isNull(schema.users.approvedAt)))
    .orderBy(asc(schema.users.submissionRequestedAt))
    .all()

  return rows
})
