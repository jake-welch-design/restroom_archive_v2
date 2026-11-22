import { z } from "zod";
import {
  plunkConfigured,
  setWeeklyReportSubscription,
} from "~~/server/utils/plunk";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { requireRole } from "~~/server/utils/requireRole";

const Body = z.object({ subscribed: z.boolean() });

/**
 * Subscribes the signed-in account's email to the Weekly Report, or takes it
 * off. No Turnstile: being signed in already proves more than the check does.
 * Stops at requireRole, not requireActiveUser, so a muted account can still
 * unsubscribe.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "archivist");
  await rateLimitByUser(event, "weekly-report-toggle", {
    max: 20,
    windowSec: 3600,
  });

  const { subscribed } = await readValidatedBody(event, Body.parse);

  if (!plunkConfigured(event))
    throw createError({
      statusCode: 503,
      statusMessage: "Email service is not configured.",
    });

  await setWeeklyReportSubscription(event, user.email, subscribed);
  return { subscribed };
});
