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
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  const target = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.role === 'admin') throw createError({ statusCode: 409, statusMessage: 'User is already an admin' })

  await db
    .update(schema.users)
    .set({
      role: 'admin',
      approvedAt: sql`coalesce(${schema.users.approvedAt}, datetime('now'))`,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id))

  await recordAdminAction(event, 'user.promote', 'user', id, body.message ? { message: body.message } : undefined)

  return { ok: true }
})
