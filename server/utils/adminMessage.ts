import type { SQL } from "drizzle-orm";
import { now } from "~~/server/utils/sqlTime";

/**
 * The partial `set()` payload that attaches an admin message to a user update.
 *
 * Spread into an existing update so a moderation action and the note explaining
 * it are written in one statement, rather than as two round trips that could
 * leave the note behind if the second failed.
 *
 * An absent or whitespace-only message yields an empty object, which spreads to
 * nothing and leaves any existing message untouched. That is deliberate: no
 * message means no banner, not an instruction to clear one. Clearing happens on
 * expiry, in server/middleware/auth.ts.
 */
export function adminMessagePatch(
  message: string | undefined,
): { adminMessage: string; adminMessageAt: SQL } | Record<string, never> {
  const trimmed = message?.trim();
  if (!trimmed) return {};
  return {
    adminMessage: trimmed,
    adminMessageAt: now(),
  };
}
