import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

/**
 * The signed-in admin's own notification settings.
 *
 * A separate route rather than two more fields on the session cookie: this is
 * admin-only data that one settings row reads once, so putting it in the
 * session would ship two columns to every archivist's browser on every request
 * for a surface they can never open.
 *
 * The topic is the only thing protecting a topic from being published to, so
 * it comes back masked. The setting row needs to show that a topic is
 * configured, not what it is -- and an admin who has forgotten theirs can look
 * it up in the ntfy app, or set a new one.
 */
function maskTopic(topic: string) {
  if (topic.length <= 4) return "•".repeat(topic.length);
  return `${topic.slice(0, 2)}${"•".repeat(Math.min(topic.length - 4, 12))}${topic.slice(-2)}`;
}

export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");

  const db = useDb(event);
  const row = await db
    .select({
      ntfyTopic: schema.users.ntfyTopic,
      adminNotifyAt: schema.users.adminNotifyAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  return {
    enabled: Boolean(row?.adminNotifyAt),
    hasTopic: Boolean(row?.ntfyTopic),
    topicHint: row?.ntfyTopic ? maskTopic(row.ntfyTopic) : null,
  };
});
