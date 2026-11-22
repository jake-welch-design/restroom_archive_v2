import { z } from "zod";
import {
  plunkConfigured,
  setWeeklyReportSubscription,
} from "~~/server/utils/plunk";
import { rateLimitByIp } from "~~/server/utils/rateLimit";
import { verifyTurnstile } from "~~/server/utils/turnstile";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  turnstileToken: z.string(),
});

/**
 * A Weekly Report signup, single opt-in: the address joins the list at once,
 * with no confirmation email (double opt-in was dropped on 2026-11-22; about a
 * quarter of signups never clicked the link). Turnstile and the rate limit are
 * what stand between the form and a bot filling the list.
 *
 * The answer is the same whether or not the address is already subscribed, so
 * the form cannot be used to find out who is on the list.
 */
export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "weekly-report-subscribe", {
    max: 5,
    windowSec: 3600,
  });

  const body = await readValidatedBody(event, Body.parse);

  if (!(await verifyTurnstile(event, body.turnstileToken)))
    throw createError({
      statusCode: 403,
      statusMessage: "Turnstile verification failed",
    });

  // Locally there is no Plunk key. Rather than failing, say so in the
  // terminal so the form can still be walked through on the dev server.
  if (import.meta.dev && !plunkConfigured(event)) {
    console.warn(
      `[weekly-report] subscribed ${body.email} (Plunk not configured)`,
    );
    return { ok: true };
  }

  await setWeeklyReportSubscription(event, body.email, true);
  return { ok: true };
});
