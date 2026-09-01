import { desc, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";

/**
 * Every account, for the admin console's Accounts section.
 *
 * Returns the session projection plus `createdAt`: the moderation UI shows the
 * same facts the session carries (role, approval, mute, ban, standing admin
 * message) and additionally sorts by sign-up date.
 *
 * `submissionCount` rides along so every row can show how much an account has
 * contributed without a request each. The submissions themselves are fetched
 * per account, only when one is expanded.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const db = useDb(event);

  // Every status counts, not just published: a row's worth of history includes
  // what was turned down.
  const submissionCount = sql<number>`(
    SELECT COUNT(*) FROM ${schema.restrooms}
    WHERE ${schema.restrooms.submittedBy} = ${schema.users.id}
  )`;

  return await db
    .select({
      ...SESSION_USER_COLUMNS,
      createdAt: schema.users.createdAt,
      submissionCount,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();
});
