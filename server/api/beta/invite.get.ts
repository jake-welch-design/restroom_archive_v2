import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { findValidInvite } from '~~/server/utils/betaInvite'

const Query = z.object({
  token: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { token } = await getValidatedQuery(event, Query.parse)

  const db = useDb(event)
  const application = await findValidInvite(db, token)

  // Only expose the email so the claim page can show who the invite is for.
  return { email: application.email }
})
