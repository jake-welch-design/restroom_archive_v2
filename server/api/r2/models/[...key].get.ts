// Fallback streaming route for GLBs served out of the MODELS R2 binding.
// Remove once NUXT_PUBLIC_MODELS_BASE_URL points at an R2 custom domain —
// that path bypasses the Worker entirely and goes straight to CDN edge.
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'Missing key' })

  const env = event.context.cloudflare?.env as { MODELS?: R2Bucket } | undefined
  if (!env?.MODELS) throw createError({ statusCode: 500, statusMessage: 'R2 binding "MODELS" not available' })

  const object = await env.MODELS.get(key)
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Model not found' })

  setHeader(event, 'content-type', object.httpMetadata?.contentType ?? 'model/gltf-binary')
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  setHeader(event, 'etag', object.httpEtag)

  return object.body
})
