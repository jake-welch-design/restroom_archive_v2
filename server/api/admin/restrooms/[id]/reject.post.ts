import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)

  const row = await db
    .update(schema.restrooms)
    .set({ status: 'hidden', updatedAt: sql`(datetime('now'))` })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id })
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  return { ok: true }
})
