import { z } from "zod";
import { sendWeeklyReportConfirmEmail } from "~~/server/utils/email";
import { plunkConfigured } from "~~/server/utils/plunk";
import { rateLimitByIp } from "~~/server/utils/rateLimit";
import { verifyTurnstile } from "~~/server/utils/turnstile";
import { publicUrls } from "~~/server/utils/urls";
import { signConfirmation } from "~~/server/utils/weeklyReportToken";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  turnstileToken: z.string(),
});

/**
 * A Weekly Report signup: emails a confirmation link and nothing else. The
 * address joins the list only once that link is followed (confirm.post.ts).
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

  const { email, ts, sig } = await signConfirmation(event, body.email);
  const link =
    `${publicUrls(event).site}/weekly-report/confirm` +
    `?email=${encodeURIComponent(email)}&ts=${ts}&sig=${sig}`;

  // Locally there is no Plunk key. Rather than failing, hand the link to the
  // terminal so the whole flow can be walked through on the dev server.
  if (import.meta.dev && !plunkConfigured(event)) {
    console.warn(`[weekly-report] confirmation link for ${email}: ${link}`);
    return { ok: true };
  }

  await sendWeeklyReportConfirmEmail(email, link);
  return { ok: true };
});
