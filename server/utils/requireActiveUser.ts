import type { H3Event } from 'h3'
import { parseSqliteUtc } from './sqliteTime'
import { requireRole, type Role } from './requireRole'

export function requireActiveUser(event: H3Event, minimum: Role = 'archivist') {
  const user = requireRole(event, minimum)

  if (user.bannedAt) {
    throw createError({ statusCode: 403, statusMessage: 'This account has been banned.' })
  }

  const mutedUntilMs = parseSqliteUtc(user.mutedUntil)
  if (mutedUntilMs != null && mutedUntilMs > Date.now()) {
    throw createError({ statusCode: 403, statusMessage: 'Your account is muted.' })
  }

  return user
}

export function requireVerifiedUser(event: H3Event, minimum: Role = 'archivist') {
  const user = requireActiveUser(event, minimum)

  if (!user.emailVerifiedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Please verify your email address before performing this action.' })
  }

  return user
}
