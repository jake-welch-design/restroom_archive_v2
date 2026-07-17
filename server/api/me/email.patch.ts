import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { verifyPassword } from '~~/server/utils/hash'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'
import { rateLimitByUser } from '~~/server/utils/rateLimit'

const Body = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)
  await rateLimitByUser(event, 'change-email', { max: 5, windowSec: 3600 })

  const { email, currentPassword } = await readValidatedBody(event, Body.parse)
  const nextEmail = email.toLowerCase().trim()

  const db = useDb(event)
  const row = await db
    .select({ email: schema.users.email, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const ok = await verifyPassword(currentPassword, row.passwordHash)
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Password is incorrect' })

  if (nextEmail === row.email) return { ok: true, email: nextEmail }

  // Friendly duplicate check; the unique index is the real guard against races.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, nextEmail))
    .get()
  if (existing) throw createError({ statusCode: 409, statusMessage: 'That email is already in use' })

  try {
    await db
      .update(schema.users)
      .set({ email: nextEmail, emailVerifiedAt: null })
      .where(eq(schema.users.id, user.id))
  }
  catch {
    throw createError({ statusCode: 409, statusMessage: 'That email is already in use' })
  }

  return { ok: true, email: nextEmail }
})
