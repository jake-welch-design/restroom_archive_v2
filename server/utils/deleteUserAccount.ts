import { eq } from "drizzle-orm";
import { schema, type useDb } from "~~/server/utils/db";
import { now } from "~~/server/utils/sqlTime";

/**
 * Deletes a non-admin user account and cleans up its foreign-key references in
 * one atomic D1 batch.
 *
 * Published restrooms remain in the archive unattributed (`submitted_by = NULL`),
 * report history is preserved with `reporter_id` / `resolved_by` cleared, and
 * annotations authored by the user are deleted (cascading any reports against
 * them). `api_tokens`, `user_blocks`, and `password_reset_tokens` cascade from
 * `users` automatically.
 */
export async function deleteUserAccount(
  db: ReturnType<typeof useDb>,
  userId: number,
) {
  await db.batch([
    db
      .update(schema.restrooms)
      .set({ submittedBy: null, updatedAt: now() })
      .where(eq(schema.restrooms.submittedBy, userId)),
    db
      .update(schema.restrooms)
      .set({ removalRequestedBy: null })
      .where(eq(schema.restrooms.removalRequestedBy, userId)),
    db
      .update(schema.annotationReports)
      .set({ reporterId: null })
      .where(eq(schema.annotationReports.reporterId, userId)),
    db
      .update(schema.annotationReports)
      .set({ resolvedBy: null })
      .where(eq(schema.annotationReports.resolvedBy, userId)),
    db
      .update(schema.annotations)
      .set({ hiddenBy: null })
      .where(eq(schema.annotations.hiddenBy, userId)),
    db
      .delete(schema.annotations)
      .where(eq(schema.annotations.authorId, userId)),
    db.delete(schema.users).where(eq(schema.users.id, userId)),
  ]);
}
