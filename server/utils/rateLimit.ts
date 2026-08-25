import type { H3Event } from "h3";

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  max: number;
  /** Window size in seconds. */
  windowSec: number;
}

function currentWindow(windowSec: number) {
  return Math.floor(Date.now() / 1000 / windowSec);
}

function getD1(event: H3Event): D1Database | null {
  const env = event.context.cloudflare?.env as { DB?: D1Database } | undefined;
  return env?.DB ?? null;
}

/** Rate-limit by authenticated user ID + action key. */
export async function rateLimitByUser(
  event: H3Event,
  action: string,
  opts: RateLimitOptions,
) {
  const user = event.context.user;
  if (!user?.id) return;
  await check(event, `u:${user.id}:${action}`, opts);
}

/** Rate-limit by remote IP + action key. */
export async function rateLimitByIp(
  event: H3Event,
  action: string,
  opts: RateLimitOptions,
) {
  const ip =
    getHeader(event, "CF-Connecting-IP") ??
    getHeader(event, "X-Forwarded-For") ??
    "unknown";
  await check(event, `i:${ip}:${action}`, opts);
}

async function check(
  event: H3Event,
  key: string,
  { max, windowSec }: RateLimitOptions,
) {
  const db = getD1(event);
  if (!db) return; // not in a Cloudflare environment (local dev fallback)

  const win = currentWindow(windowSec);

  await db
    .prepare(
      "INSERT INTO rate_limits (key, window, count) VALUES (?, ?, 1) ON CONFLICT(key, window) DO UPDATE SET count = count + 1",
    )
    .bind(key, win)
    .run();

  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE key = ? AND window = ?")
    .bind(key, win)
    .first<{ count: number }>();

  if ((row?.count ?? 0) > max) {
    const retryAfter = Math.max(
      1,
      (win + 1) * windowSec - Math.floor(Date.now() / 1000),
    );
    setHeader(event, "Retry-After", retryAfter);
    throw createError({ statusCode: 429, statusMessage: "Too many requests" });
  }

  // Probabilistic cleanup (~1 % of calls) so the table doesn't grow unboundedly.
  if (Math.random() < 0.01) {
    await db
      .prepare("DELETE FROM rate_limits WHERE window < ?")
      .bind(win - 10)
      .run();
  }
}
