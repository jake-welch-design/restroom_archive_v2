import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'

// Temporary local-only helper for manual QA. Not part of the app — delete after testing.
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, 1))
    .get()
  if (!user) throw createError({ statusCode: 404, statusMessage: 'No user id 1' })

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      submissionRequestedAt: user.submissionRequestedAt ?? null,
      approvedAt: user.approvedAt ?? null,
      mutedUntil: user.mutedUntil ?? null,
      bannedAt: user.bannedAt ?? null,
      adminMessage: user.adminMessage ?? null,
      adminMessageAt: user.adminMessageAt ?? null,
    },
  })

  return { ok: true, user: { id: user.id, username: user.username, role: user.role } }
})
