import { and, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { getRouterString } from "~~/server/utils/routeParams";

// Keyed by path parameter rather than request body because reading a body on a
// DELETE request hangs under Cloudflare workerd.
export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  const username = getRouterString(event, "username").toLowerCase();
  const db = useDb(event);

  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();

  if (target) {
    await db
      .delete(schema.userBlocks)
      .where(
        and(
          eq(schema.userBlocks.blockerId, user.id),
          eq(schema.userBlocks.blockedId, target.id),
        ),
      );
  }

  return { ok: true };
});
