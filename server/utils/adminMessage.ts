import { sql, type SQL } from "drizzle-orm";

// Returns the partial set() payload for attaching an admin message to a user
// update. Empty/whitespace-only messages are intentionally ignored — per the
// product spec, no message means no banner is written.
export function adminMessagePatch(
  message: string | undefined,
): { adminMessage: string; adminMessageAt: SQL } | Record<string, never> {
  const trimmed = message?.trim();
  if (!trimmed) return {};
  return {
    adminMessage: trimmed,
    adminMessageAt: sql`(datetime('now'))`,
  };
}
