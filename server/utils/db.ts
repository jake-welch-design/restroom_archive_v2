import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../db/schema'

export function useDb(event: H3Event) {
  const env = event.context.cloudflare?.env as { DB?: D1Database } | undefined
  if (!env?.DB) {
    throw createError({ statusCode: 500, statusMessage: 'D1 binding "DB" not available. Run `wrangler pages dev` or `nuxt dev` with a wrangler.toml present.' })
  }
  return drizzle(env.DB, { schema })
}

export { schema }
