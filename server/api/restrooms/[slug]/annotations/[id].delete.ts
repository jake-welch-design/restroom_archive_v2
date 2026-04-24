import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireApproved } from '~~/server/utils/requireApproved'

export default defineEventHandler(async (event) => {
  const user = requireApproved(event)

  const slug = getRouterParam(event, 'slug')
  const id = Number(getRouterParam(event, 'id'))
  if (!slug || !id) throw createError({ statusCode: 400, statusMessage: 'Missing slug or id' })

  const db = useDb(event)

  const restroom = await db
    .select({ id: schema.restrooms.id })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get()

  if (!restroom) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  const annotation = await db
    .select({ authorId: schema.annotations.authorId, restroomId: schema.annotations.restroomId })
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .get()

  if (!annotation || annotation.restroomId !== restroom.id) {
    throw createError({ statusCode: 404, statusMessage: 'Annotation not found' })
  }

  if (annotation.authorId !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'You can only delete your own annotations.' })
  }

  await db
    .delete(schema.annotations)
    .where(and(eq(schema.annotations.id, id), eq(schema.annotations.restroomId, restroom.id)))

  return { ok: true }
})
