import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const { imageData } = await readValidatedBody(event, z.object({ imageData: z.string() }).parse)

  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  const thumbKey = `${slug}.jpg`

  const env = event.context.cloudflare?.env as { THUMBS?: R2Bucket } | undefined
  if (!env?.THUMBS) throw createError({ statusCode: 500, statusMessage: 'THUMBS bucket not available' })

  await env.THUMBS.put(thumbKey, buffer, {
    httpMetadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  const db = useDb(event)
  await db
    .update(schema.restrooms)
    .set({ thumbKey })
    .where(eq(schema.restrooms.slug, slug))

  return { ok: true }
})
