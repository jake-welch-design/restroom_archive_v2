import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'

const Body = z.object({
  agreements: z.array(z.string()).length(6),
})

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)

  await readValidatedBody(event, Body.parse)

  const db = useDb(event)

  await db
    .update(schema.users)
    .set({ submissionRequestedAt: sql`(datetime('now'))` })
    .where(eq(schema.users.id, user.id))

  return { ok: true }
})
