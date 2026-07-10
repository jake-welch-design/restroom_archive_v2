import type { H3Event } from 'h3'
import { useDb, schema } from '~~/server/utils/db'

export type AuditTargetType = 'user' | 'restroom' | 'annotation' | 'beta_application'

export async function recordAdminAction(
  event: H3Event,
  action: string,
  targetType: AuditTargetType,
  targetId: number,
  metadata?: Record<string, unknown>,
) {
  try {
    const actor = event.context.user
    const db = useDb(event)
    await db.insert(schema.adminAuditLog).values({
      actorId: actor?.id ?? null,
      action,
      targetType,
      targetId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
  }
  catch (err) {
    // Never let an audit-log failure break the actual admin operation.
    console.error('audit log write failed', { action, targetType, targetId, err })
  }
}
