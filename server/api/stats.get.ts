import { eq, isNull, sql } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'

// Public running totals for the About page's stat strip. Cheap aggregate
// counts rather than shipping the full restroom/user/annotation lists just to
// measure them client-side.
export default defineEventHandler(async (event) => {
  const db = useDb(event)

  const restroomsRow = await db
    .select({
      n: sql<number>`count(*)`,
      cities: sql<number>`count(distinct ${schema.restrooms.location})`,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.status, 'published'))
    .get()

  const archivistsRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.users)
    .where(isNull(schema.users.bannedAt))
    .get()

  const annotationsRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.annotations)
    .where(isNull(schema.annotations.hiddenAt))
    .get()

  return {
    restrooms: Number(restroomsRow?.n ?? 0),
    cities: Number(restroomsRow?.cities ?? 0),
    archivists: Number(archivistsRow?.n ?? 0),
    annotations: Number(annotationsRow?.n ?? 0),
  }
})
