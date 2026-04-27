import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { hashPassword } from '~~/server/utils/hash'
import { verifyTurnstile } from '~~/server/utils/turnstile'

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100).optional(),
  turnstileToken: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, Body.parse)

  const ok = await verifyTurnstile(event, body.turnstileToken)
  if (!ok) throw createError({ statusCode: 403, statusMessage: 'Turnstile verification failed' })

  const db = useDb(event)

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase()))
    .get()
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Email already registered' })

  const passwordHash = await hashPassword(body.password)

  const user = await db
    .insert(schema.users)
    .values({
      email: body.email.toLowerCase(),
      passwordHash,
      displayName: body.displayName ?? null,
    })
    .returning()
    .get()

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
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
