import { desc, eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

export default defineEventHandler(async (event) => {
  const user = requireRole(event, "archivist");
  const db = useDb(event);

  const rows = await db
    .select({
      username: schema.users.username,
      displayName: schema.users.displayName,
      createdAt: schema.userBlocks.createdAt,
    })
    .from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.userBlocks.blockedId, schema.users.id))
    .where(eq(schema.userBlocks.blockerId, user.id))
    .orderBy(desc(schema.userBlocks.createdAt))
    .all();

  return rows;
});

