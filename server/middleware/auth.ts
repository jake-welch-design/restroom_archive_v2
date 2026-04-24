import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'

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
        approvedAt: schema.users.approvedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .get()

    if (user) {
      event.context.user = user
    }
    else {
      // User was deleted — clear stale session
      await clearUserSession(event)
    }
  }
  catch {
    // DB not available (e.g. during build); skip silently
  }
})
