import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { publishToNtfy } from "~~/server/utils/notify";

/**
 * Sends one notification to the caller's own topic.
 *
 * Worth a route of its own because a mistyped topic fails silently and
 * identically to a working one -- nothing arrives, and nothing says why. This
 * turns "did I set this up right?" into a button, and it is the only path here
 * that reports a delivery failure to the caller rather than swallowing it.
 *
 * Deliberately awaited rather than backgrounded: the answer is the point.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");
  await rateLimitByUser(event, "notify-test", { max: 10, windowSec: 3600 });

  const db = useDb(event);
  const row = await db
    .select({ ntfyTopic: schema.users.ntfyTopic })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!row?.ntfyTopic) {
    throw createError({
      statusCode: 422,
      statusMessage: "No ntfy topic set.",
    });
  }

  const sent = await publishToNtfy(row.ntfyTopic, {
    title: "Restroom Archive",
    message: "Notifications are working. This is a test.",
    tags: ["white_check_mark"],
  });

  if (!sent.ok) {
    // Reports what actually went wrong rather than a single generic message.
    // This route exists to diagnose a setup that fails silently, so collapsing
    // every cause into one string defeats the point of having it.
    // The detail rides in `data`, not `statusMessage`: h3 sanitizes status
    // messages, which would strip the punctuation out of ntfy's own error
    // text. `apiErrorMessage` reads `data` first, so the form shows this one.
    throw createError({
      statusCode: 502,
      statusMessage: "Test notification failed",
      data: { message: sent.reason },
    });
  }

  return { ok: true };
});
