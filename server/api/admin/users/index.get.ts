import { desc } from 'drizzle-orm'
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
      role: schema.users.role,
      submissionRequestedAt: schema.users.submissionRequestedAt,
      approvedAt: schema.users.approvedAt,
      mutedUntil: schema.users.mutedUntil,
      bannedAt: schema.users.bannedAt,
      adminMessage: schema.users.adminMessage,
      adminMessageAt: schema.users.adminMessageAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all()

  return rows
})
