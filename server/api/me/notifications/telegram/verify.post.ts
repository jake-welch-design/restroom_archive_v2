import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { isWithinHours } from "~~/shared/utils/sqliteTime";
import {
  findChatByCode,
  LINK_CODE_TTL_MINUTES,
  sendTelegramMessage,
} from "~~/server/utils/telegram";

/**
 * Finishes linking a Telegram chat: finds the chat that sent this admin's
 * pending code to the bot and stores it as their notification destination.
 *
 * Linking does not turn notifications on. That stays the admin's own explicit
 * choice in the settings row, the same as it was before a chat existed.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");
  // Loose, because pressing Verify before Telegram has delivered the message
  // is the normal first attempt, not a mistake.
  await rateLimitByUser(event, "telegram-verify", { max: 30, windowSec: 3600 });

  const db = useDb(event);
  const row = await db
    .select({
      code: schema.users.telegramLinkCode,
      codeAt: schema.users.telegramLinkCodeAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!row?.code || !isWithinHours(row.codeAt, LINK_CODE_TTL_MINUTES / 60)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Link code expired",
      data: {
        message: `The link code has expired. Codes last ${LINK_CODE_TTL_MINUTES} minutes; start again.`,
      },
    });
  }

  const found = await findChatByCode(event, row.code);
  if (!found.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: "Could not check Telegram",
      data: { message: found.reason },
    });
  }
  if (!found.result) {
    throw createError({
      statusCode: 422,
      statusMessage: "Code not received yet",
      data: {
        message:
          "The bot hasn't received your code yet. Press Start in the Telegram chat, then Verify again.",
      },
    });
  }

  const { chatId, name } = found.result;
  await db
    .update(schema.users)
    .set({
      telegramChatId: chatId,
      telegramName: name,
      telegramLinkCode: null,
      telegramLinkCodeAt: null,
    })
    .where(eq(schema.users.id, user.id));

  // Replies in the chat so the admin sees the link from both ends. Best
  // effort: the chat is already linked, and "Send test" can retry delivery.
  await sendTelegramMessage(
    event,
    chatId,
    "<b>Connected to The Restroom Archive.</b>\n" +
      "Turn on “Receive Admin Notifications” in your Profile to get a message here for each new submission.",
  );

  return { ok: true, telegramName: name };
});
