import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { verifyTurnstile } from '~~/server/utils/turnstile'
import { rateLimitByIp } from '~~/server/utils/rateLimit'
import { sendBetaApplicationNotification } from '~~/server/utils/email'

const Body = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(25),
  socials: z.string().min(1).max(300).optional(),
  foundVia: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
  // Must be checked: the applicant agrees to the submission rules and mission.
  agreeTerms: z.literal(true),
  turnstileToken: z.string(),
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, 'beta-apply', { max: 5, windowSec: 3600 })

  const body = await readValidatedBody(event, Body.parse)

  const ok = await verifyTurnstile(event, body.turnstileToken)
  if (!ok) throw createError({ statusCode: 403, statusMessage: 'Turnstile verification failed' })

  const email = body.email.toLowerCase()
  const db = useDb(event)

  // If an account already exists, or an application is already pending/approved
  // for this email, return the same generic success so the response can't be
  // used to probe which emails are registered.
  const existingUser = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get()
  if (existingUser) return { ok: true }

  const existingApplication = await db
    .select({ id: schema.betaApplications.id })
    .from(schema.betaApplications)
    .where(and(
      eq(schema.betaApplications.email, email),
      inArray(schema.betaApplications.status, ['pending', 'approved']),
    ))
    .get()
  if (existingApplication) return { ok: true }

  const application = await db
    .insert(schema.betaApplications)
    .values({
      email,
      displayName: body.displayName,
      socials: body.socials ?? null,
      foundVia: body.foundVia,
      reason: body.reason,
      termsAcceptedAt: sql`(datetime('now'))`,
    })
    .returning()
    .get()

  // Notify the admin. Don't block the application if the email fails to send.
  try {
    await sendBetaApplicationNotification({
      email: application.email,
      displayName: application.displayName,
      socials: application.socials,
      foundVia: application.foundVia,
      reason: application.reason,
    })
  }
  catch {
    // Non-fatal; the application is still recorded and visible in the admin queue.
  }

  return { ok: true }
})
