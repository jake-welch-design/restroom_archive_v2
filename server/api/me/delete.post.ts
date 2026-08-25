import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { verifyPassword } from '~~/server/utils/hash'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'
import { rateLimitByUser } from '~~/server/utils/rateLimit'

const Body = z.object({
  password: z.string().min(1),
})

// POST, not DELETE, because this needs a request body: reading a body off a
// DELETE hangs forever under workerd (the request is killed as "hung" and
// Cloudflare reports it as Error 1101), even though it works fine in `nuxt dev`
// under Node. Matches the admin-side POST .../delete convention.
export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)
  await rateLimitByUser(event, 'self-delete', { max: 3, windowSec: 3600 })

  const { password } = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  const row = await db
    .select({ id: schema.users.id, role: schema.users.role, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  // Admins must use the admin tooling; otherwise they could lose recovery paths.
  if (row.role === 'admin') {
    throw createError({ statusCode: 409, statusMessage: 'Admin accounts cannot self-delete. Contact another admin.' })
  }

  const ok = await verifyPassword(password, row.passwordHash)
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Password is incorrect' })

  // Mirror admin delete: published restrooms stay in the archive (unattributed),
  // annotations are removed, the user row is dropped.
  await db
    .update(schema.restrooms)
    .set({ submittedBy: null, updatedAt: sql`(datetime('now'))` })
    .where(eq(schema.restrooms.submittedBy, user.id))

  await db
    .update(schema.restrooms)
    .set({ removalRequestedBy: null })
    .where(eq(schema.restrooms.removalRequestedBy, user.id))

  await db
    .update(schema.annotationReports)
    .set({ reporterId: null })
    .where(eq(schema.annotationReports.reporterId, user.id))

  await db
    .update(schema.annotationReports)
    .set({ resolvedBy: null })
    .where(eq(schema.annotationReports.resolvedBy, user.id))

  await db
    .update(schema.annotations)
    .set({ hiddenBy: null })
    .where(eq(schema.annotations.hiddenBy, user.id))

  await db
    .delete(schema.annotations)
    .where(eq(schema.annotations.authorId, user.id))

  await db
    .delete(schema.users)
    .where(eq(schema.users.id, user.id))

  await clearUserSession(event)

  return { ok: true }
})
