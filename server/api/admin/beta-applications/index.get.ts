import { asc, eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const db = useDb(event)

  const rows = await db
    .select({
      id: schema.betaApplications.id,
      email: schema.betaApplications.email,
      displayName: schema.betaApplications.displayName,
      socials: schema.betaApplications.socials,
      foundVia: schema.betaApplications.foundVia,
      reason: schema.betaApplications.reason,
      createdAt: schema.betaApplications.createdAt,
    })
    .from(schema.betaApplications)
    .where(eq(schema.betaApplications.status, 'pending'))
    .orderBy(asc(schema.betaApplications.createdAt))
    .all()

  return rows
})
