import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { isWithinHours } from "~~/shared/utils/sqliteTime";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";

/**
 * Refreshes the sealed session payload whenever nuxt-auth-utils reads it.
 *
 * This is the counterpart to server/middleware/auth.ts. The middleware feeds
 * the server-side request context; this hook feeds what `useUserSession()`
 * hands the client, so a role or approval change reaches the browser's own view
 * of the user without requiring a sign-out.
 *
 * The expired-admin-message case is handled read-only here. The middleware owns
 * the write that actually clears the row, so doing it in both places would mean
 * two identical updates per request.
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook("fetch", async (session, event) => {
    if (!session.user?.id) return;
    try {
      const db = useDb(event);
      const fresh = await db
        .select(SESSION_USER_COLUMNS)
        .from(schema.users)
        .where(eq(schema.users.id, session.user.id))
        .get();

      if (!fresh) return;

      if (fresh.adminMessage && !isWithinHours(fresh.adminMessageAt, 24)) {
        fresh.adminMessage = null;
        fresh.adminMessageAt = null;
      }

      session.user = fresh;
    } catch {
      // No database binding, which happens during prerender and build. The
      // existing session payload stands rather than the request failing.
    }
  });
});
