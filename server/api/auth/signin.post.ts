import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { verifyPassword } from '~~/server/utils/hash'
import { verifyTurnstile } from '~~/server/utils/turnstile'
import { rateLimitByIp } from '~~/server/utils/rateLimit'

const Body = z.object({
  email: z.string().email(),
  password: z.string(),
  turnstileToken: z.string(),
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, 'signin', { max: 10, windowSec: 3600 })

  const body = await readValidatedBody(event, Body.parse)

  const ok = await verifyTurnstile(event, body.turnstileToken)
  if (!ok) throw createError({ statusCode: 403, statusMessage: 'Turnstile verification failed' })

  const db = useDb(event)

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase()))
    .get()

  // Use the same error message for missing user and wrong password to prevent enumeration
  const valid = user ? await verifyPassword(body.password, user.passwordHash) : false
  if (!user || !valid) throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })

  if (user.bannedAt) {
    throw createError({ statusCode: 403, statusMessage: 'This account has been banned.' })
  }

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

  return { ok: true }
})
