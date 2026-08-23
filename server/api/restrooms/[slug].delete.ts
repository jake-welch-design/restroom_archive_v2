import { eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

// Lets a submitter clear a rejected entry from their "My submissions" list.
// Admins can also delete in any state. Both paths drop the R2 object.
export default defineEventHandler(async (event) => {
  const user = requireRole(event, 'archivist')

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)

  const restroom = await db
    .select({
      id: schema.restrooms.id,
      file: schema.restrooms.file,
      status: schema.restrooms.status,
      submittedBy: schema.restrooms.submittedBy,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get()

  if (!restroom) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  const isOwner = restroom.submittedBy === user.id
  if (!isOwner && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'You can only dismiss your own submissions.' })
  }

  const dismissable = ['rejected', 'hidden', 'pending', 'removed']
  if (isOwner && user.role !== 'admin' && !dismissable.includes(restroom.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Only pending or rejected submissions can be dismissed.' })
  }

  const env = event.context.cloudflare?.env as { MODELS?: R2Bucket } | undefined
  if (env?.MODELS) {
    try { await env.MODELS.delete(restroom.file) }
    catch { /* missing object — proceed with DB delete anyway */ }
  }

  await db.delete(schema.restrooms).where(eq(schema.restrooms.id, restroom.id))

  return { ok: true }
})
