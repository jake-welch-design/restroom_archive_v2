import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { verifyUserPassword } from "~~/server/utils/hash";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { deleteUserAccount } from "~~/server/utils/deleteUserAccount";

const Body = z.object({
  password: z.string().min(1),
});

// POST, not DELETE, because this needs a request body: reading a body off a
// DELETE hangs forever under workerd (the request is killed as "hung" and
// Cloudflare reports it as Error 1101), even though it works fine in `nuxt dev`
// under Node. Matches the admin-side POST .../delete convention.
export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "self-delete", { max: 3, windowSec: 3600 });

  const { password } = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const row = await db
    .select({
      id: schema.users.id,
      role: schema.users.role,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Account not found" });

  // Admins must use the admin tooling; otherwise they could lose recovery paths.
  if (row.role === "admin") {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Admin accounts cannot self-delete. Contact another admin.",
    });
  }

  const ok = await verifyUserPassword(password, row.passwordHash);
  if (!ok)
    throw createError({
      statusCode: 401,
      statusMessage: "Password is incorrect",
    });

  await deleteUserAccount(db, user.id);
  await clearUserSession(event);

  return { ok: true };
});
