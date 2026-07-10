import { and, eq, isNull } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { schema } from '~~/server/utils/db'
import { hashToken } from '~~/server/utils/hash'

/**
 * Look up an approved beta application by its raw invite token. Returns the row
 * only if the token matches an approved, unclaimed, unexpired invite. Throws a
 * 400/410 otherwise. Shared by the invite-check GET and the claim POST so both
 * apply identical validation.
 */
export async function findValidInvite(
  db: DrizzleD1Database<typeof schema>,
  token: string,
) {
  const tokenHash = hashToken(token)

  const application = await db
    .select()
    .from(schema.betaApplications)
    .where(and(
      eq(schema.betaApplications.inviteTokenHash, tokenHash),
      eq(schema.betaApplications.status, 'approved'),
      isNull(schema.betaApplications.claimedAt),
    ))
    .get()

  if (!application) {
    throw createError({ statusCode: 400, statusMessage: 'This invite link is invalid or has already been used.' })
  }

  if (application.inviteExpiresAt && application.inviteExpiresAt < new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    throw createError({ statusCode: 410, statusMessage: 'This invite link has expired.' })
  }

  return application
}
