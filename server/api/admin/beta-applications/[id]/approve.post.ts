import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { generateToken, hashToken } from '~~/server/utils/hash'
import { recordAdminAction } from '~~/server/utils/auditLog'
import { sendBetaInviteEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const admin = requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)

  // Confirm the application is still pending before doing any work so a stale
  // double-click can't re-issue an invite for one that's already handled.
  const application = await db
    .select({ email: schema.betaApplications.email })
    .from(schema.betaApplications)
    .where(and(eq(schema.betaApplications.id, id), eq(schema.betaApplications.status, 'pending')))
    .get()

  if (!application) throw createError({ statusCode: 404, statusMessage: 'Application not found or already handled' })

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  // Send the invite BEFORE committing the approval. If email delivery fails the
  // row stays pending, so the admin sees the error and can cleanly retry rather
  // than being stuck with an approved application and no way to resend.
  await sendBetaInviteEmail(application.email, token)

  await db
    .update(schema.betaApplications)
    .set({
      status: 'approved',
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: expiresAt,
      invitedAt: sql`(datetime('now'))`,
      reviewedAt: sql`(datetime('now'))`,
      reviewedBy: admin.id,
    })
    .where(and(eq(schema.betaApplications.id, id), eq(schema.betaApplications.status, 'pending')))

  await recordAdminAction(event, 'beta.approve', 'beta_application', id)

  return { ok: true }
})
