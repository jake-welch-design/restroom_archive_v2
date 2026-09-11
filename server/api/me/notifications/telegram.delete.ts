import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

/**
 * Unlinks the admin's Telegram chat.
 *
 * Clears the opt-in along with the chat, because notifications cannot be on
 * without a destination -- the same rule the settings route enforces when
 * turning them on.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");

  await useDb(event)
    .update(schema.users)
    .set({
      telegramChatId: null,
      telegramName: null,
      telegramLinkCode: null,
      telegramLinkCodeAt: null,
      adminNotifyAt: null,
    })
    .where(eq(schema.users.id, user.id));

  return { ok: true };
});
