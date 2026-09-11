import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { now } from "~~/server/utils/sqlTime";
import {
  getBotUsername,
  LINK_CODE_TTL_MINUTES,
  newLinkCode,
} from "~~/server/utils/telegram";

/**
 * Starts linking a Telegram chat: issues a one-time code and the deep link
 * that sends it to the bot.
 *
 * The admin opens `t.me/<bot>?start=<code>`, presses Start, and Telegram sends
 * `/start <code>` from their chat. `verify.post.ts` then looks for that
 * message. Proving control of the chat this way, rather than letting an admin
 * type a chat id in, means nobody can point another account's notifications
 * at a chat they own.
 *
 * Issuing a new code replaces any earlier one, so only the latest link works.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");
  await rateLimitByUser(event, "telegram-link", { max: 10, windowSec: 3600 });

  // Fetched first so a missing or wrong token is reported before a code is
  // stored that could never be used.
  const bot = await getBotUsername(event);
  if (!bot.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: "Could not reach the Telegram bot",
      data: { message: bot.reason },
    });
  }

  const code = newLinkCode();
  await useDb(event)
    .update(schema.users)
    .set({ telegramLinkCode: code, telegramLinkCodeAt: now() })
    .where(eq(schema.users.id, user.id));

  return {
    code,
    botUsername: bot.result,
    url: `https://t.me/${bot.result}?start=${code}`,
    expiresInMinutes: LINK_CODE_TTL_MINUTES,
  };
});
