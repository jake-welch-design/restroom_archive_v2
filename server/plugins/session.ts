import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { isWithinHours } from '~~/server/utils/sqliteTime'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user?.id) return
    try {
      const db = useDb(event)
      const fresh = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          username: schema.users.username,
          displayName: schema.users.displayName,
          role: schema.users.role,
          submissionRequestedAt: schema.users.submissionRequestedAt,
          approvedAt: schema.users.approvedAt,
          mutedUntil: schema.users.mutedUntil,
          bannedAt: schema.users.bannedAt,
          adminMessage: schema.users.adminMessage,
          adminMessageAt: schema.users.adminMessageAt,
          emailVerifiedAt: schema.users.emailVerifiedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, session.user.id))
        .get()

      if (!fresh) return

      if (fresh.adminMessage && !isWithinHours(fresh.adminMessageAt, 24)) {
        fresh.adminMessage = null
        fresh.adminMessageAt = null
      }

      session.user = fresh
    }
    catch {
      // DB unavailable (e.g. during build) — leave stale session in place
    }
  })
})
