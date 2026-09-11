import type { H3Event } from "h3";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { escapeHtml } from "~~/shared/utils/html";
import {
  sendTelegramMessage,
  telegramToken,
  type TelegramResult,
} from "~~/server/utils/telegram";

/**
 * Admin notifications for the moderation queues, delivered as Telegram
 * messages from the archive's bot.
 *
 * Every send here is best-effort. A notification is a convenience layered on
 * top of an operation that already succeeded, so a failure to deliver one must
 * never fail the submission, the request, or whatever else triggered it. This
 * mirrors `recordAdminAction`, which swallows its own failures for the same
 * reason.
 */

export interface AdminNotification {
  /** The first line, in bold. */
  title: string;
  /** The rest of the message. Newlines are kept. */
  body: string;
  /**
   * Where the body links to. Unlike a push notification, whose only link is
   * the whole notification, a Telegram message can link a span of its text,
   * so this attaches to the body and leaves the title plain.
   */
  link?: string;
}

/**
 * Renders a notification as Telegram HTML, escaping every piece of it: the
 * title and body carry user-supplied restroom names and usernames, and an
 * unescaped `<` in either would make Telegram reject the whole message as
 * malformed markup.
 *
 * The link is only attached when it is https. In local dev it would point at
 * `localhost`, which is no use from a phone, and Telegram can reject a whole
 * message over a link it considers invalid -- so there the body goes out as
 * plain text rather than risking the send.
 */
export function renderAdminNotification(n: AdminNotification): string {
  const title = `<b>${escapeHtml(n.title)}</b>`;
  const body = escapeHtml(n.body);
  const linkable = n.link?.startsWith("https://");
  return linkable
    ? `${title}\n<a href="${escapeHtml(n.link!)}">${body}</a>`
    : `${title}\n${body}`;
}

/** Sends one notification to one chat. Never throws. */
export function sendAdminNotification(
  event: H3Event,
  chatId: string,
  n: AdminNotification,
): Promise<TelegramResult<unknown>> {
  return sendTelegramMessage(event, chatId, renderAdminNotification(n));
}

/**
 * Runs `promise` after the response has been sent where the platform allows
 * it, and inline otherwise.
 *
 * On Cloudflare, `waitUntil` keeps the worker alive for the notification
 * without holding up the reply -- which for a submission means the archivist
 * is not waiting on Telegram behind a 50 MB upload. Locally there is no
 * execution context, so it falls back to awaiting, which is what the dev
 * server needs to actually perform the send before the process moves on.
 */
function runInBackground(event: H3Event, promise: Promise<unknown>) {
  const ctx = event.context.cloudflare?.context;
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise);
    return Promise.resolve();
  }
  return promise;
}

/**
 * Sends a notification to every admin who has linked a chat and opted in.
 *
 * The opt-in is per account and checked here, on the server, on every send:
 * promoting someone to admin does not subscribe them to anything, and an admin
 * who has never opened the setting has no chat and is skipped.
 */
export async function notifyAdmins(event: H3Event, n: AdminNotification) {
  try {
    // Checked before the query so a missing token is one clear log line per
    // event, rather than one failed send per recipient.
    if (!telegramToken(event)) {
      console.error("admin notify skipped: NUXT_TELEGRAM_BOT_TOKEN not set");
      return;
    }

    const db = useDb(event);
    const recipients = await db
      .select({ chatId: schema.users.telegramChatId })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "admin"),
          isNotNull(schema.users.telegramChatId),
          isNotNull(schema.users.adminNotifyAt),
          // A banned admin is still an admin row; do not page one.
          isNull(schema.users.bannedAt),
        ),
      )
      .all();

    if (!recipients.length) return;

    await runInBackground(
      event,
      Promise.all(
        recipients.map((r) =>
          sendAdminNotification(event, r.chatId as string, n),
        ),
      ).then((results) => {
        // A real notification has no one to report a failure to, so the log is
        // the only trace. Each failure's reason is already logged by the
        // Telegram client; this records how many of the batch it affected.
        const failed = results.filter((r) => !r.ok).length;
        if (failed) console.error("admin notify: sends failed", failed);
      }),
    );
  } catch (err) {
    // Never let a notification failure break the operation that triggered it.
    console.error("admin notify failed", { title: n.title, err });
  }
}
