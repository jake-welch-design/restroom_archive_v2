import { desc, eq, sql } from "drizzle-orm";
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

  // Counted by joining rather than by a correlated subquery: drizzle renders
  // column references unqualified in a single-table query, which inside a
  // subquery over restrooms silently resolves `users.id` to `restrooms.id`.
  // Counting the joined id rather than the rows gives 0, not 1, for an account
  // that has submitted nothing.
  return await db
    .select({
      ...SESSION_USER_COLUMNS,
      createdAt: schema.users.createdAt,
      submissionCount: sql<number>`count(${schema.restrooms.id})`,
    })
    .from(schema.users)
    .leftJoin(
      schema.restrooms,
      eq(schema.restrooms.submittedBy, schema.users.id),
    )
    .groupBy(schema.users.id)
    .orderBy(desc(schema.users.createdAt))
    .all();
});
