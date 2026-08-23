import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'
import { recordAdminAction } from '~~/server/utils/auditLog'

// Grants a removal request: the entry leaves the archive and the request leaves
// the queue. Deliberately not `reject` — that status means "this submission
// wasn't accepted", which is the wrong story to tell someone who asked for
// their own scan to be taken down (and it left the request in the queue).
export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)

  const row = await db
    .update(schema.restrooms)
    .set({
      status: 'removed',
      removalRequestedBy: null,
      removalReason: null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id, file: schema.restrooms.file, thumbKey: schema.restrooms.thumbKey })
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  // The point of an honoured removal is that the scan itself is gone, not just
  // delisted — drop the R2 blobs the same way a rejection does.
  const env = event.context.cloudflare?.env as { MODELS?: R2Bucket; THUMBS?: R2Bucket } | undefined
  await Promise.allSettled([
    env?.MODELS?.delete(row.file),
    row.thumbKey ? env?.THUMBS?.delete(row.thumbKey) : Promise.resolve(),
  ])

  await recordAdminAction(event, 'restroom.remove', 'restroom', id)

  return { ok: true }
})
