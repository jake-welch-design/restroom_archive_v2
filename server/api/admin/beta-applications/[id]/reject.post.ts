import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { recordAdminAction } from '~~/server/utils/auditLog'

export default defineEventHandler(async (event) => {
  const admin = requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)

  // Only act on pending applications so an already-approved invite isn't voided
  // by a stale click.
  const row = await db
    .update(schema.betaApplications)
    .set({
      status: 'rejected',
      reviewedAt: sql`(datetime('now'))`,
      reviewedBy: admin.id,
    })
    .where(and(eq(schema.betaApplications.id, id), eq(schema.betaApplications.status, 'pending')))
    .returning({ id: schema.betaApplications.id })
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Application not found or already handled' })

  await recordAdminAction(event, 'beta.reject', 'beta_application', id)

  return { ok: true }
})
