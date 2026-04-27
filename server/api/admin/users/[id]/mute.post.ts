import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { adminMessagePatch } from '~~/server/utils/adminMessage'

const Body = z.object({
  days: z.number().int().positive().max(3650),
  message: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (id === actor.id) throw createError({ statusCode: 400, statusMessage: 'You cannot mute yourself' })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  const target = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.role === 'admin') throw createError({ statusCode: 409, statusMessage: 'Cannot mute an admin' })

  await db
    .update(schema.users)
    .set({
      mutedUntil: sql`datetime('now', ${`+${body.days} days`})`,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id))

  return { ok: true }
})
