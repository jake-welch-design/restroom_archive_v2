import { eq, isNull, and, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { recordAdminAction } from '~~/server/utils/auditLog'

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)

  const annotation = await db
    .select({ id: schema.annotations.id })
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .get()

  if (!annotation) throw createError({ statusCode: 404, statusMessage: 'Annotation not found' })

  await db
    .update(schema.annotations)
    .set({ hiddenAt: sql`(datetime('now'))`, hiddenBy: actor.id })
    .where(eq(schema.annotations.id, id))

  await db
    .update(schema.annotationReports)
    .set({ resolvedAt: sql`(datetime('now'))`, resolvedBy: actor.id })
    .where(and(
      eq(schema.annotationReports.annotationId, id),
      isNull(schema.annotationReports.resolvedAt),
    ))

  await recordAdminAction(event, 'annotation.hide', 'annotation', id)

  return { ok: true }
})
