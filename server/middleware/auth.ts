import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { isWithinHours } from "~~/shared/utils/sqliteTime";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";

/**
 * Attaches the current user to `event.context.user` for every request.
 *
 * The session cookie already carries a user, but it is a snapshot from
 * sign-in time. Re-reading the row here is what makes moderation take effect
 * immediately: a ban, a mute, a role change or a revoked approval applies on
 * the caller's next request rather than whenever their cookie next rotates.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session.user?.id) return;

  try {
    const db = useDb(event);
    const user = await db
      .select(SESSION_USER_COLUMNS)
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .get();

    if (!user) {
      // The account was deleted while the cookie was still valid. Clearing the
      // session stops every later request repeating this lookup.
      await clearUserSession(event);
      return;
    }

    // Admin messages expire 24 hours after they are set. Clearing the row on
    // the first expired read, rather than on a schedule, keeps the check to one
    // comparison per request and means an expired message is never re-evaluated
    // a second time.
    if (user.adminMessage && !isWithinHours(user.adminMessageAt, 24)) {
      await db
        .update(schema.users)
        .set({ adminMessage: null, adminMessageAt: null })
        .where(eq(schema.users.id, user.id));
      user.adminMessage = null;
      user.adminMessageAt = null;
    }

    event.context.user = user;
  } catch {
    // No database binding, which happens during prerender and build. Requests
    // continue unauthenticated rather than failing outright.
  }
});
