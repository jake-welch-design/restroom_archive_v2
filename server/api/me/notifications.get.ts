import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { telegramToken } from "~~/server/utils/telegram";

/**
 * The signed-in admin's own notification settings.
 *
 * A separate route rather than more fields on the session cookie: this is
 * admin-only data that one settings row reads once, so putting it in the
 * session would ship it to every archivist's browser on every request for a
 * surface they can never open.
 *
 * The chat id itself is not returned. On its own it cannot send anything, but
 * the settings row has no use for it -- only for whether a chat is linked and
 * which account it is.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");

  const db = useDb(event);
  const row = await db
    .select({
      telegramChatId: schema.users.telegramChatId,
      telegramName: schema.users.telegramName,
      adminNotifyAt: schema.users.adminNotifyAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  return {
    enabled: Boolean(row?.adminNotifyAt),
    connected: Boolean(row?.telegramChatId),
    telegramName: row?.telegramName ?? null,
    // Whether the *server* can talk to Telegram at all, as opposed to whether
    // this admin has linked a chat. Surfaced so a missing secret shows up in
    // the settings row, not as notifications that simply never arrive. A
    // boolean only; the token never leaves the server.
    serverConfigured: Boolean(telegramToken(event)),
  };
});
