import type { H3Event } from "h3";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";

/**
 * Push notifications for the admin queues, delivered through ntfy.
 *
 * ntfy is a free publish/subscribe service: the phone app subscribes to a
 * topic name, and anyone who knows that name can publish to it over plain
 * HTTP. That is the whole integration -- no account, no API key, no SDK, and
 * nothing to pay for. The trade is that the topic name is the only secret, so
 * it is treated like one: never returned in full to the client, never logged,
 * and only ever set by the admin it belongs to.
 *
 * Every send here is best-effort. A notification is a convenience layered on
 * top of an operation that already succeeded, so a failure to deliver one must
 * never fail the submission, the request, or whatever else triggered it. This
 * mirrors `recordAdminAction`, which swallows its own failures for the same
 * reason.
 */

// Publishing to the root URL with a JSON body rather than to /<topic> with
// metadata in headers: header values are latin-1, so a restroom named with any
// non-ASCII character would arrive mangled or be rejected outright.
const NTFY_URL = "https://ntfy.sh";

// How long to wait on ntfy before giving up. Short on purpose: the caller is
// usually finishing a user-facing request, and a slow notification service
// must not become a slow submission.
const TIMEOUT_MS = 5000;

/**
 * Optional ntfy access token, sent as a bearer credential when set.
 *
 * Not about permission -- a public topic needs none -- but about which bucket
 * the rate limit is counted against. ntfy identifies a "visitor" by source IP,
 * and a Cloudflare Worker's outbound requests leave from Cloudflare's shared
 * egress pool, so an anonymous publish from production is metered against an IP
 * shared with every other tenant in that colo. That quota is routinely already
 * spent by strangers, which is a 429 on the first message of the day with no
 * way to earn it back. Authenticating attaches the publish to an account, whose
 * tier limits apply instead of the shared IP's.
 *
 * Left empty in local dev, where the request comes from the machine's own IP
 * and has its own quota.
 *
 * The event is required, not optional. On Cloudflare the environment is bound
 * per request rather than living in a process-wide `process.env`, so
 * `useRuntimeConfig()` with no event can resolve to the build-time defaults --
 * where this is the empty string. That failure is invisible: the publish still
 * goes out, just anonymously, and is then metered against the shared egress IP
 * exactly as if no token had ever been configured.
 */
function ntfyToken(event: H3Event): string {
  return useRuntimeConfig(event).ntfyToken || "";
}

/**
 * ntfy's own topic rule. Enforced here rather than only at the edge of the API
 * so a malformed topic cannot be stored and then quietly fail on every send.
 */
const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidNtfyTopic(topic: string): boolean {
  return TOPIC_RE.test(topic);
}

/**
 * Accepts what people actually paste. The app shows a topic as a URL, so
 * `https://ntfy.sh/my-topic` and a bare `my-topic` both have to work.
 */
export function normalizeNtfyTopic(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/\/+$/, "");
}

export interface NtfyMessage {
  title: string;
  message: string;
  /** Emoji shortcodes shown next to the title, e.g. ["toilet"]. */
  tags?: string[];
  /** Where tapping the notification goes. */
  click?: string;
}

/**
 * The outcome of one publish.
 *
 * Structured rather than a boolean because the three ways a send fails are not
 * interchangeable and cannot be told apart after the fact: a topic the server
 * refused to even attempt, a topic ntfy rejected, and a network failure all
 * end with nothing arriving on the phone. The "Send test" button exists to
 * distinguish them, so the reason has to survive the return.
 *
 * `reason` is safe to show a signed-in admin: it never carries the topic.
 */
export type PublishResult = { ok: true } | { ok: false; reason: string };

/** Publishes one message to one topic. Never throws. */
export async function publishToNtfy(
  event: H3Event,
  topic: string,
  msg: NtfyMessage,
): Promise<PublishResult> {
  if (!isValidNtfyTopic(topic)) {
    // Previously a silent early return, which is the one failure that produces
    // no log line anywhere and so looked identical to ntfy being down.
    return {
      ok: false,
      reason:
        "The stored topic is not a valid ntfy topic name. Set it again in Alerts.",
    };
  }

  try {
    const token = ntfyToken(event);
    const res = await fetch(NTFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        topic,
        title: msg.title,
        message: msg.message,
        tags: msg.tags,
        click: msg.click,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // The topic travels in the request body, not the URL, so the status and
      // ntfy's own error text are safe to surface. The topic itself is not,
      // and is never logged.
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      // Whether a token was actually attached is the one thing a 429 cannot be
      // read without: the same "daily quota reached" body comes back for a
      // quota spent by this account and for one spent by strangers sharing
      // Cloudflare's egress IP. Logged as a boolean -- never the token.
      console.error(
        "ntfy publish failed",
        res.status,
        `authenticated=${token ? "yes" : "no"}`,
        detail,
      );
      // 429 is worth naming, because the obvious reading of it is wrong: it
      // rarely means this archive sent too much. Anonymous publishes are
      // metered per source IP, and in production that IP belongs to
      // Cloudflare's shared egress pool, so the quota is usually spent by
      // other tenants before the first message of the day.
      if (res.status === 429 && !token) {
        return {
          ok: false,
          reason:
            "ntfy rejected the message: the daily quota for this server's " +
            "shared outbound IP is used up. Set an ntfy access token " +
            "(NUXT_NTFY_TOKEN) so sends count against an account instead.",
        };
      }
      return { ok: false, reason: `ntfy returned ${res.status}. ${detail}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("ntfy publish threw", err);
    const name = err instanceof Error ? err.name : "";
    return {
      ok: false,
      reason:
        name === "TimeoutError" || name === "AbortError"
          ? `ntfy did not respond within ${TIMEOUT_MS / 1000}s.`
          : `Could not reach ntfy: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Runs `promise` after the response has been sent where the platform allows
 * it, and inline otherwise.
 *
 * On Cloudflare, `waitUntil` keeps the worker alive for the notification
 * without holding up the reply -- which for a submission means the archivist
 * is not waiting on ntfy behind a 50 MB upload. Locally there is no execution
 * context, so it falls back to awaiting, which is what the dev server needs to
 * actually perform the send before the process moves on.
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
 * Sends a message to every admin who has opted in and set a topic.
 *
 * The opt-in is per account and checked here, on the server, on every send:
 * promoting someone to admin does not subscribe them to anything, and an admin
 * who has never opened the setting has both columns NULL and is skipped.
 */
export async function notifyAdmins(event: H3Event, msg: NtfyMessage) {
  try {
    const db = useDb(event);
    const recipients = await db
      .select({ topic: schema.users.ntfyTopic })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "admin"),
          isNotNull(schema.users.ntfyTopic),
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
        recipients.map((r) => publishToNtfy(event, r.topic as string, msg)),
      ).then((results) => {
        // A real notification has no one to report a failure to, so the log is
        // the only trace. Counted rather than listed, to keep topics out of it.
        const failed = results.filter((r) => !r.ok).length;
        if (failed) console.error("admin notify: sends failed", failed);
      }),
    );
  } catch (err) {
    // Never let a notification failure break the operation that triggered it.
    console.error("admin notify failed", { title: msg.title, err });
  }
}
