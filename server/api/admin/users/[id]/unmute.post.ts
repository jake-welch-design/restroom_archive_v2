import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { adminMessagePatch } from '~~/server/utils/adminMessage'

const Body = z.object({
  message: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  await db
    .update(schema.users)
    .set({
      mutedUntil: null,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id))

  return { ok: true }
})
