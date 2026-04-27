import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { isWithinHours } from '~~/server/utils/sqliteTime'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user?.id) return

  try {
    const db = useDb(event)
    const user = await db
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
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .get()

    if (!user) {
      // User was deleted — clear stale session
      await clearUserSession(event)
      return
    }

    // Admin messages auto-expire after 24h. Lazily clear the row on the first
    // expired read so we're not re-checking the same stale value forever.
    if (user.adminMessage && !isWithinHours(user.adminMessageAt, 24)) {
      await db
        .update(schema.users)
        .set({ adminMessage: null, adminMessageAt: null })
        .where(eq(schema.users.id, user.id))
      user.adminMessage = null
      user.adminMessageAt = null
    }

    event.context.user = user
  }
  catch {
    // DB not available (e.g. during build); skip silently
  }
})
