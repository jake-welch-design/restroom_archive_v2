import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { validateUsername } from '~~/server/utils/username'

const Body = z.object({
  username: z.string().min(1).max(40),
})

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = await readValidatedBody(event, Body.parse)
  const v = validateUsername(body.username)
  if (!v.ok) throw createError({ statusCode: 422, statusMessage: v.reason })

  const db = useDb(event)

  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get()
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const collision = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.username, v.value), ne(schema.users.id, id)))
    .get()
  if (collision) throw createError({ statusCode: 409, statusMessage: 'That username is already taken' })

  await db
    .update(schema.users)
    .set({ username: v.value })
    .where(eq(schema.users.id, id))

  return { ok: true, username: v.value }
})
