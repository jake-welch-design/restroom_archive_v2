import type { H3Event } from "h3";

/**
 * The Weekly Report's old double opt-in link, signed rather than stored.
 *
 * Signups have been single opt-in since 2026-11-22, so nothing signs new links.
 * Verification stays so links already emailed still work until they expire
 * (7 days, so by 2026-11-29). After that this file, server/api/newsletter/
 * confirm.post.ts, pages/weekly-report/confirm.vue and
 * renderWeeklyReportConfirm in shared/utils/weeklyReport.ts can all go.
 *
 * A signup emails a link carrying the address, the time, and an HMAC of both.
 * Confirming checks the signature and the age, then adds the contact to Plunk.
 * Nothing is written until then, so an unconfirmed signup leaves no record and
 * there is no table to migrate or prune.
 *
 * Keyed off the session secret, with a purpose suffix so a signature made here
 * can never be mistaken for anything else signed with the same secret.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function hmacKey(event: H3Event) {
  const secret = useRuntimeConfig(event).session?.password;
  if (!secret)
    throw createError({
      statusCode: 500,
      statusMessage: "Session secret is not configured.",
    });
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${secret}:weekly-report-confirm`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function fromHex(hex: string) {
  const pairs = hex.match(/^[0-9a-f]{64}$/) ? hex.match(/../g)! : [];
  return new Uint8Array(pairs.map((p) => parseInt(p, 16)));
}

const payload = (email: string, ts: number) => `${email}\n${ts}`;

export async function verifyConfirmation(
  event: H3Event,
  email: string,
  ts: number,
  sig: string,
): Promise<"ok" | "invalid" | "expired"> {
  const bytes = fromHex(sig);
  if (bytes.length !== 32 || !Number.isFinite(ts)) return "invalid";
  // `verify` compares in constant time, which a string comparison would not.
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(event),
    bytes,
    new TextEncoder().encode(payload(email, ts)),
  );
  if (!ok) return "invalid";
  return Date.now() - ts > MAX_AGE_MS ? "expired" : "ok";
}
