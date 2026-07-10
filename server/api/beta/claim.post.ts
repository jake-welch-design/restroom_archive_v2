import { eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { hashPassword } from '~~/server/utils/hash'
import { validateUsername } from '~~/server/utils/username'
import { rateLimitByIp } from '~~/server/utils/rateLimit'
import { findValidInvite } from '~~/server/utils/betaInvite'

const Body = z.object({
  token: z.string().min(1),
  username: z.string().min(1).max(40),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, 'beta-claim', { max: 10, windowSec: 3600 })

  const body = await readValidatedBody(event, Body.parse)

  const db = useDb(event)
  const application = await findValidInvite(db, body.token)

  const v = validateUsername(body.username)
  if (!v.ok) throw createError({ statusCode: 422, statusMessage: v.reason })

  const email = application.email
  const username = v.value

  // The email came from an approved application, but guard against it (or the
  // chosen username) having been taken since the invite was issued.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(or(eq(schema.users.email, email), eq(schema.users.username, username)))
    .get()
  if (existing) throw createError({ statusCode: 409, statusMessage: 'That email or username is already taken' })

  const passwordHash = await hashPassword(body.password)
  const now = sql`(datetime('now'))`

  // Full contributor access on claim: approved + submission-requested + email
  // already verified (receiving the invite proves the address).
  const user = await db
    .insert(schema.users)
    .values({
      email,
      username,
      passwordHash,
      displayName: application.displayName ?? null,
      approvedAt: now,
      submissionRequestedAt: now,
      emailVerifiedAt: now,
    })
    .returning()
    .get()

  // Mark the invite claimed and burn the token so it can't be reused.
  await db
    .update(schema.betaApplications)
    .set({
      claimedAt: now,
      userId: user.id,
      inviteTokenHash: null,
    })
    .where(eq(schema.betaApplications.id, application.id))

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      submissionRequestedAt: user.submissionRequestedAt ?? null,
      approvedAt: user.approvedAt ?? null,
      mutedUntil: user.mutedUntil ?? null,
      bannedAt: user.bannedAt ?? null,
      adminMessage: user.adminMessage ?? null,
      adminMessageAt: user.adminMessageAt ?? null,
    },
  })

  return { ok: true }
})
