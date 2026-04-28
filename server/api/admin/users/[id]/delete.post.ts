import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (id === actor.id) throw createError({ statusCode: 400, statusMessage: 'You cannot delete yourself' })

  const db = useDb(event)

  const target = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.role === 'admin') throw createError({ statusCode: 409, statusMessage: 'Cannot delete an admin account' })

  // Null out FK references so restrooms stay in the archive (unattributed)
  await db
    .update(schema.restrooms)
    .set({ submittedBy: null, updatedAt: sql`(datetime('now'))` })
    .where(eq(schema.restrooms.submittedBy, id))

  await db
    .update(schema.restrooms)
    .set({ removalRequestedBy: null })
    .where(eq(schema.restrooms.removalRequestedBy, id))

  // Remove the user's annotations before deleting the account
  await db
    .delete(schema.annotations)
    .where(eq(schema.annotations.authorId, id))

  await db
    .delete(schema.users)
    .where(eq(schema.users.id, id))

  return { ok: true }
})
