import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { hashPassword, verifyPassword } from '~~/server/utils/hash'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'
import { rateLimitByUser } from '~~/server/utils/rateLimit'

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)
  await rateLimitByUser(event, 'change-password', { max: 5, windowSec: 3600 })

  const { currentPassword, newPassword } = await readValidatedBody(event, Body.parse)

  const db = useDb(event)
  const row = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const ok = await verifyPassword(currentPassword, row.passwordHash)
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Current password is incorrect' })

  const newHash = await hashPassword(newPassword)

  await db
    .update(schema.users)
    .set({ passwordHash: newHash })
    .where(eq(schema.users.id, user.id))

  return { ok: true }
})
