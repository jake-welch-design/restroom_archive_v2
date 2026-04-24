import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)

  // Only delete if still unapproved — avoids nuking an active user if someone
  // double-clicks the wrong button after approval raced in.
  const row = await db
    .delete(schema.users)
    .where(and(eq(schema.users.id, id), isNull(schema.users.approvedAt)))
    .returning({ id: schema.users.id })
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found or already approved' })

  return { ok: true }
})
