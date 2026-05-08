import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { generateToken, hashToken } from '~~/server/utils/hash'
import { sendVerificationEmail } from '~~/server/utils/email'
import { rateLimitByUser } from '~~/server/utils/rateLimit'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  const user = requireRole(event, 'archivist')
  await rateLimitByUser(event, 'resend-verification', { max: 3, windowSec: 3600 })

  if (user.emailVerifiedAt) {
    return { ok: true, alreadyVerified: true }
  }

  const db = useDb(event)
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  // Invalidate any existing unused tokens for this user.
  await db
    .update(schema.emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(schema.emailVerificationTokens.userId, user.id))

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  await db.insert(schema.emailVerificationTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  })

  await sendVerificationEmail(user.email, token)

  return { ok: true }
})
