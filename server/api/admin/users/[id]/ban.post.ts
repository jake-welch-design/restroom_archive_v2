import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { adminMessagePatch } from '~~/server/utils/adminMessage'
import { recordAdminAction } from '~~/server/utils/auditLog'

const Body = z.object({
  message: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (id === actor.id) throw createError({ statusCode: 400, statusMessage: 'You cannot ban yourself' })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  const target = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.role === 'admin') throw createError({ statusCode: 409, statusMessage: 'Cannot ban an admin' })

  await db
    .update(schema.users)
    .set({
      bannedAt: sql`(datetime('now'))`,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id))

  // Soft-hide the banned user's submissions so the public archive treats the
  // account's contributions as withdrawn. Hidden rows stay in the DB and R2 so
  // the action is reversible (e.g. by manually flipping the status back).
  await db
    .update(schema.restrooms)
    .set({ status: 'hidden', updatedAt: sql`(datetime('now'))` })
    .where(eq(schema.restrooms.submittedBy, id))

  await recordAdminAction(event, 'user.ban', 'user', id, body.message ? { message: body.message } : undefined)

  return { ok: true }
})
