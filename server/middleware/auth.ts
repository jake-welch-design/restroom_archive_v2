import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { hashToken } from "~~/server/utils/hash";
import { extractBearerToken } from "~~/server/utils/mobileToken";
import { now } from "~~/server/utils/sqlTime";
import { isFuture, isWithinHours } from "~~/shared/utils/sqliteTime";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";

/**
 * Attaches the current user to `event.context.user` for every request.
 *
 * The session cookie already carries a user, but it is a snapshot from
 * sign-in time. Re-reading the row here is what makes moderation take effect
 * immediately: a ban, a mute, a role change or a revoked approval applies on
 * the caller's next request rather than whenever their cookie next rotates.
 *
 * When no cookie session is present, native mobile callers may present an
 * `Authorization: Bearer` token instead. Web browsers never send that header,
 * so the cookie path for the website is untouched.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  let userId: number | null = session.user?.id ?? null;
  const fromCookie = userId != null;
  const rawBearer = fromCookie ? null : extractBearerToken(event);

  if (userId == null && !rawBearer) return;

  try {
    const db = useDb(event);

    if (userId == null && rawBearer) {
      const tokenHash = hashToken(rawBearer);
      const tokenRow = await db
        .select({
          id: schema.apiTokens.id,
          userId: schema.apiTokens.userId,
          expiresAt: schema.apiTokens.expiresAt,
          lastUsedAt: schema.apiTokens.lastUsedAt,
        })
        .from(schema.apiTokens)
        .where(eq(schema.apiTokens.tokenHash, tokenHash))
        .get();

      if (!tokenRow) return;
      if (!isFuture(tokenRow.expiresAt)) {
        await db
          .delete(schema.apiTokens)
          .where(eq(schema.apiTokens.id, tokenRow.id));
        return;
      }

      userId = tokenRow.userId;

      // Throttle `last_used_at` writes to once per hour per token so routine
      // read traffic from the app does not turn every GET into a D1 write.
      if (!isWithinHours(tokenRow.lastUsedAt, 1)) {
        await db
          .update(schema.apiTokens)
          .set({ lastUsedAt: now() })
          .where(eq(schema.apiTokens.id, tokenRow.id));
      }
    }

    if (userId == null) return;

    const user = await db
      .select(SESSION_USER_COLUMNS)
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();

    if (!user) {
      // The account was deleted while the cookie was still valid. Clearing the
      // session stops every later request repeating this lookup.
      if (fromCookie) await clearUserSession(event);
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
