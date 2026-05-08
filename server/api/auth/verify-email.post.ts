import { eq, and, isNull, gt } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { hashToken } from '~~/server/utils/hash'

const Body = z.object({
  token: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, Body.parse)
  const tokenHash = hashToken(token)
  const db = useDb(event)

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  const row = await db
    .select()
    .from(schema.emailVerificationTokens)
    .where(
      and(
        eq(schema.emailVerificationTokens.tokenHash, tokenHash),
        isNull(schema.emailVerificationTokens.usedAt),
        gt(schema.emailVerificationTokens.expiresAt, now),
      ),
    )
    .get()

  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'This verification link is invalid or has expired.' })
  }

  await db
    .update(schema.users)
    .set({ emailVerifiedAt: now })
    .where(eq(schema.users.id, row.userId))

  await db
    .update(schema.emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(schema.emailVerificationTokens.id, row.id))

  // Refresh the session so emailVerifiedAt is immediately reflected.
  const session = await getUserSession(event)
  if (session.user?.id === row.userId) {
    await setUserSession(event, {
      user: { ...session.user, emailVerifiedAt: now },
    })
  }

  return { ok: true }
})
