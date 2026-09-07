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

  // Deliberately loose for a button whose whole purpose is to be pressed
  // repeatedly while getting the setup right. It still bounds outbound sends,
  // but the first attempt at configuring notifications should not run out of
  // budget halfway through -- especially since a failed send counts too, so
  // the attempts that deliver nothing are exactly the ones being metered.
  //
  // The window is a fixed clock hour rather than a rolling one, so spacing
  // presses out does not earn budget back. The message says so, because
  // "Too many requests" invites the reasonable but wrong conclusion that
  // waiting a minute between presses would have helped.
  try {
    await rateLimitByUser(event, "notify-test", { max: 30, windowSec: 3600 });
  } catch {
    throw createError({
      statusCode: 429,
      statusMessage: "Too many test notifications",
      data: {
        message:
          "Test sends are capped at 30 an hour, and failed attempts count. " +
          "The cap clears at the top of the hour.",
      },
    });
  }

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
