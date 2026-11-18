import { z } from "zod";
import { plunk, plunkConfigured } from "~~/server/utils/plunk";
import { rateLimitByIp } from "~~/server/utils/rateLimit";
import { verifyConfirmation } from "~~/server/utils/weeklyReportToken";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  ts: z.coerce.number(),
  sig: z.string().max(64),
});

/**
 * The second half of the double opt-in. Called by the confirm page's script
 * rather than by the emailed link itself, because mail scanners follow links
 * to check them, and a GET that subscribed would let a scanner confirm on the
 * reader's behalf.
 */
export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "weekly-report-confirm", {
    max: 20,
    windowSec: 3600,
  });

  const body = await readValidatedBody(event, Body.parse);
  const result = await verifyConfirmation(event, body.email, body.ts, body.sig);
  if (result === "invalid")
    throw createError({
      statusCode: 400,
      statusMessage: "This confirmation link isn't valid.",
    });
  if (result === "expired")
    throw createError({
      statusCode: 410,
      statusMessage:
        "This confirmation link has expired. Please sign up again.",
    });

  if (import.meta.dev && !plunkConfigured(event)) {
    console.warn(
      `[weekly-report] confirmed ${body.email} (Plunk not configured)`,
    );
    return { ok: true };
  }

  // An upsert: an existing contact (from a password reset, say) is updated in
  // place, and a returning subscriber who had unsubscribed is opted back in,
  // which is what following a fresh confirmation link asks for.
  await plunk(event, "/contacts", {
    method: "POST",
    body: {
      email: body.email,
      subscribed: true,
      data: {
        weeklyReport: true,
        weeklyReportConfirmedAt: new Date().toISOString(),
      },
    },
  });

  return { ok: true };
});
