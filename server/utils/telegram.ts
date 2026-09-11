import type { H3Event } from "h3";

/**
 * A thin client for the three Telegram Bot API methods the admin notifications
 * use: `getMe` (the bot's username, for the link), `getUpdates` (to find the
 * message an admin sent to link their chat) and `sendMessage`.
 *
 * Telegram meters a bot by its token rather than by the caller's IP, which is
 * the whole reason for using it: a Worker's outbound requests leave from
 * Cloudflare's shared egress pool, and a service that rate-limits by IP (as
 * ntfy did) hands this archive's quota to whoever else shares that address.
 *
 * The token sits in the URL path, as the Bot API requires, so nothing here
 * logs a URL, and error text is scrubbed of the token before it goes anywhere.
 */

const API = "https://api.telegram.org";

// Short on purpose: callers are usually finishing a user-facing request, and a
// slow Telegram must not become a slow submission.
const TIMEOUT_MS = 5000;

/**
 * The bot token, or "" when none is configured.
 *
 * Read through the event, never `useRuntimeConfig()` bare: on Cloudflare the
 * environment is bound per request, and the no-event form can resolve to the
 * build-time default -- the empty string -- even with the secret set. That is
 * exactly how the ntfy token went missing in production without any error.
 */
export function telegramToken(event: H3Event): string {
  return useRuntimeConfig(event).telegramBotToken || "";
}

export type TelegramResult<T> =
  { ok: true; result: T } | { ok: false; reason: string; status?: number };

/** Calls one Bot API method. Never throws; failures come back as a reason. */
async function call<T>(
  event: H3Event,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<TelegramResult<T>> {
  const token = telegramToken(event);
  if (!token) {
    return {
      ok: false,
      reason:
        "The server has no Telegram bot token. Set NUXT_TELEGRAM_BOT_TOKEN and redeploy.",
    };
  }

  const scrub = (s: string) => s.split(token).join("***");

  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;

    if (!res.ok || !body?.ok) {
      const description = scrub(body?.description ?? `HTTP ${res.status}`);
      console.error("telegram call failed", method, res.status, description);
      return {
        ok: false,
        status: res.status,
        reason:
          res.status === 401 || res.status === 404
            ? "Telegram rejected the bot token. Check NUXT_TELEGRAM_BOT_TOKEN."
            : `Telegram: ${description}`,
      };
    }
    return { ok: true, result: body.result as T };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = scrub(err instanceof Error ? err.message : String(err));
    console.error("telegram call threw", method, name, message);
    return {
      ok: false,
      reason:
        name === "TimeoutError" || name === "AbortError"
          ? `Telegram did not respond within ${TIMEOUT_MS / 1000}s.`
          : `Could not reach Telegram: ${message}`,
    };
  }
}

/** The bot's @username, which the link-your-chat step needs to point at. */
export async function getBotUsername(
  event: H3Event,
): Promise<TelegramResult<string>> {
  const me = await call<{ username?: string }>(event, "getMe");
  if (!me.ok) return me;
  if (!me.result.username) {
    return { ok: false, reason: "Telegram returned a bot with no username." };
  }
  return { ok: true, result: me.result.username };
}

/**
 * Sends one HTML-formatted message. Callers are responsible for escaping
 * anything user-supplied that goes into `html`.
 */
export function sendTelegramMessage(
  event: H3Event,
  chatId: string,
  html: string,
): Promise<TelegramResult<unknown>> {
  return call(event, "sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    // The queue link would otherwise unfurl into a preview card of the
    // account page, which is a login screen to Telegram's crawler.
    link_preview_options: { is_disabled: true },
  });
}

/* --- Linking a chat ------------------------------------------------------ */

// Without 0/O and 1/I/L, so a code read off one screen and typed on another
// cannot be mistyped into a different valid code.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** How long a link code stays valid after it is issued. */
export const LINK_CODE_TTL_MINUTES = 15;

/**
 * A one-time code proving that a Telegram chat belongs to the admin who asked
 * for it. Eight characters from a 31-symbol alphabet is about 40 bits: far
 * beyond guessing within the code's 15-minute life, while still short enough
 * to type on a phone when the deep link cannot be opened there.
 */
export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  // The modulo bias from 256 % 31 is a fraction of a bit across the code,
  // which does not matter for a value that expires in minutes.
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { username?: string; first_name?: string };
  };
}

export interface LinkedChat {
  chatId: string;
  name: string;
}

/**
 * Matches `/start CODE` (what the deep link sends), `/start@BotName CODE`,
 * and a bare `CODE` typed by hand.
 */
function extractCode(text: string): string | null {
  const m = text.trim().match(/^(?:\/start(?:@\w+)?\s+)?([A-Za-z0-9]{4,64})$/);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Finds the private chat that sent `code` to the bot.
 *
 * Reads the bot's pending updates rather than receiving them on a webhook, so
 * there is no public endpoint to secure and nothing to register with Telegram.
 * The cost is that `getUpdates` returns the oldest updates first, 100 at a
 * time, and the only way to page is to acknowledge a page, which discards it.
 * So the first page is read without acknowledging anything, and later pages
 * are only reached by consuming earlier ones -- which only happens when the
 * bot has a backlog of more than 100 unread messages, all of them strangers'
 * or stale. Telegram also discards updates older than 24 hours on its own.
 */
export async function findChatByCode(
  event: H3Event,
  code: string,
): Promise<TelegramResult<LinkedChat | null>> {
  let offset: number | undefined;

  for (let page = 0; page < 10; page++) {
    const res = await call<TelegramUpdate[]>(event, "getUpdates", {
      limit: 100,
      timeout: 0,
      allowed_updates: ["message"],
      ...(offset !== undefined ? { offset } : {}),
    });
    if (!res.ok) return res;

    for (const u of res.result) {
      const msg = u.message;
      // A private chat only: a code posted in a group would otherwise link
      // the whole group, and everyone in it, to this admin's notifications.
      if (!msg?.text || msg.chat.type !== "private") continue;
      if (extractCode(msg.text) !== code) continue;
      return {
        ok: true,
        result: {
          chatId: String(msg.chat.id),
          name: msg.from?.username
            ? `@${msg.from.username}`
            : (msg.from?.first_name ?? "Telegram"),
        },
      };
    }

    if (res.result.length < 100) break;
    offset = res.result[res.result.length - 1]!.update_id + 1;
  }

  return { ok: true, result: null };
}
