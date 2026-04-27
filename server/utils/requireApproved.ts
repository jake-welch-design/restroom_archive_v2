import type { H3Event } from 'h3'
import { requireActiveUser } from './requireActiveUser'

export function requireApproved(event: H3Event) {
  const user = requireActiveUser(event)
  if (user.role !== 'admin' && !user.approvedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Your account is awaiting admin approval.' })
  }
  return user
}
