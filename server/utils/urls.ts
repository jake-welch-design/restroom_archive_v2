import type { H3Event } from 'h3'

export function publicUrls(event: H3Event) {
  const config = useRuntimeConfig(event)
  const origin = getRequestURL(event).origin
  return {
    models: config.public.modelsBaseUrl || `${origin}/api/r2/models`,
    thumbs: config.public.thumbsBaseUrl || `${origin}/api/r2/thumbs`,
    site: config.public.siteUrl || origin,
  }
}
