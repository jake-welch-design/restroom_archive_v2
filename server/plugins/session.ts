import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'

export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user?.id) return
    try {
      const db = useDb(event)
      const fresh = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
          role: schema.users.role,
          approvedAt: schema.users.approvedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, session.user.id))
        .get()

      if (fresh) {
        session.user = fresh
      }
    }
    catch {
      // DB unavailable (e.g. during build) — leave stale session in place
    }
  })
})
