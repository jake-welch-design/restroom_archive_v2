export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'Missing key' })

  const env = event.context.cloudflare?.env as { THUMBS?: R2Bucket } | undefined
  if (!env?.THUMBS) throw createError({ statusCode: 500, statusMessage: 'R2 binding "THUMBS" not available' })

  const object = await env.THUMBS.get(key)
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Thumbnail not found' })

  setHeader(event, 'content-type', object.httpMetadata?.contentType ?? 'image/jpeg')
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  setHeader(event, 'etag', object.httpEtag)

  return object.body
})
