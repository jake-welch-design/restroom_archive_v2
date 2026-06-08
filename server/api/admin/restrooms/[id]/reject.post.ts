import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { recordAdminAction } from '~~/server/utils/auditLog'

const Body = z.object({
  message: z.string().trim().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = await readValidatedBody(event, async (raw) => {
    if (raw == null) return {}
    return Body.parse(raw)
  })
  const message = body.message ?? null

  const db = useDb(event)

  const row = await db
    .update(schema.restrooms)
    .set({
      status: 'rejected',
      rejectionMessage: message || null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id, file: schema.restrooms.file, thumbKey: schema.restrooms.thumbKey })
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  // Clean up R2 blobs for rejected submissions so storage doesn't accumulate orphaned files.
  const env = event.context.cloudflare?.env as { MODELS?: R2Bucket; THUMBS?: R2Bucket } | undefined
  await Promise.allSettled([
    env?.MODELS?.delete(row.file),
    row.thumbKey ? env?.THUMBS?.delete(row.thumbKey) : Promise.resolve(),
  ])

  await recordAdminAction(event, 'restroom.reject', 'restroom', id, message ? { message } : undefined)

  return { ok: true }
})
