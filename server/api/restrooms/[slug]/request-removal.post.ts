import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'
import { rateLimitByUser } from '~~/server/utils/rateLimit'

const Body = z.object({
  reason: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)
  await rateLimitByUser(event, 'req-removal', { max: 10, windowSec: 86400 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  const row = await db
    .update(schema.restrooms)
    .set({
      removalRequestedBy: user.id,
      removalReason: body.reason ?? null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.restrooms.slug, slug))
    .returning({ id: schema.restrooms.id })
    .get()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  return { ok: true }
})
