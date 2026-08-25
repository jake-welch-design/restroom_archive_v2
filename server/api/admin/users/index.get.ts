import { desc } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";

/**
 * Every account, for the admin console's Accounts section.
 *
 * Returns the session projection plus `createdAt`: the moderation UI shows the
 * same facts the session carries (role, approval, mute, ban, standing admin
 * message) and additionally sorts by sign-up date.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const db = useDb(event);

  return await db
    .select({ ...SESSION_USER_COLUMNS, createdAt: schema.users.createdAt })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();
});
