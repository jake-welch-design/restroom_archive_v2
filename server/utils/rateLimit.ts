import type { H3Event } from "h3";

interface RateLimitOptions {
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
  if (!db) return; // local fallback when no Cloudflare D1 binding is present

  const win = currentWindow(windowSec);
  // Wall-clock Unix timestamp when this window ends, comparable across actions
  // with different `windowSec` values (see migration 0023).
  const expiresAt = (win + 1) * windowSec;

  const row = await db
    .prepare(
      "INSERT INTO rate_limits (key, window, count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count",
    )
    .bind(key, win, expiresAt)
    .first<{ count: number }>();

  if ((row?.count ?? 0) > max) {
    const retryAfter = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
    setHeader(event, "Retry-After", retryAfter);
    throw createError({ statusCode: 429, statusMessage: "Too many requests" });
  }

  // Probabilistic cleanup (~1% of calls) bounded by wall-clock expiry so the
  // table does not grow without bound. Offloaded via waitUntil on Cloudflare so
  // the caller never waits for the sweep.
  if (Math.random() < 0.01) {
    const nowSec = Math.floor(Date.now() / 1000);
    const sweep = db
      .prepare(
        "DELETE FROM rate_limits WHERE expires_at IS NULL OR expires_at < ?",
      )
      .bind(nowSec)
      .run();
    const ctx = event.context.cloudflare?.context;
    if (ctx?.waitUntil) ctx.waitUntil(sweep);
    else await sweep;
  }
}
