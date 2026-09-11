import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { sendAdminNotification } from "~~/server/utils/notify";

/**
 * Sends one notification to the caller's own linked chat.
 *
 * Worth a route of its own because a broken setup fails silently -- nothing
 * arrives, and nothing says why. This turns "is this working?" into a button,
 * and it is the only path here that reports a delivery failure to the caller
 * rather than swallowing it. It goes through the same renderer as a real
 * notification, so a message that renders here renders there.
 *
 * Deliberately awaited rather than backgrounded: the answer is the point.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");

  // Deliberately loose for a button whose whole purpose is to be pressed
  // repeatedly while getting the setup right. Failed attempts count too, and
  // the window is a fixed clock hour rather than a rolling one, so the message
  // says so -- "Too many requests" alone invites the wrong conclusion that
  // spacing presses out would have helped.
  try {
    await rateLimitByUser(event, "notify-test", { max: 30, windowSec: 3600 });
  } catch {
    throw createError({
      statusCode: 429,
      statusMessage: "Too many test notifications",
      data: {
        message:
          "Test sends are capped at 30 an hour, and failed attempts count. " +
          "The cap clears at the top of the hour.",
      },
    });
  }

  const db = useDb(event);
  const row = await db
    .select({ chatId: schema.users.telegramChatId })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!row?.chatId) {
    throw createError({
      statusCode: 422,
      statusMessage: "Telegram is not connected.",
    });
  }

  const sent = await sendAdminNotification(event, row.chatId, {
    title: "Test from The Restroom Archive",
    body: "Notifications are working.",
  });

  if (!sent.ok) {
    // The detail rides in `data`, not `statusMessage`: h3 sanitizes status
    // messages, which would strip the punctuation out of Telegram's own error
    // text. `apiErrorMessage` reads `data` first, so the form shows this one.
    throw createError({
      statusCode: 502,
      statusMessage: "Test notification failed",
      data: { message: sent.reason },
    });
  }

  return { ok: true };
});
