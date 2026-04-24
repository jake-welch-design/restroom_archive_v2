import type { H3Event } from 'h3'
import { requireRole } from './requireRole'

export function requireApproved(event: H3Event) {
  const user = requireRole(event, 'archivist')
  if (user.role !== 'admin' && !user.approvedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Your account is awaiting admin approval.' })
  }
  return user
}
