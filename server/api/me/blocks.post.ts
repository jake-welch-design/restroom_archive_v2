import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";

const Body = z.object({
  username: z.string().trim().min(1).max(40),
});

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "block-user", { max: 30, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);
  const db = useDb(event);

  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, body.username.toLowerCase()))
    .get();

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  if (target.id === user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot block your own account",
    });
  }

  await db
    .insert(schema.userBlocks)
    .values({
      blockerId: user.id,
      blockedId: target.id,
    })
    .onConflictDoNothing();

  return { ok: true };
});

