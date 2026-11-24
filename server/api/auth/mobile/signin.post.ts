import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { verifyUserPassword } from "~~/server/utils/hash";
import { issueMobileToken } from "~~/server/utils/mobileToken";
import { rateLimitByIp } from "~~/server/utils/rateLimit";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceLabel: z.string().max(80).optional(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "mobile-signin", { max: 10, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);
  const db = useDb(event);

  const row = await db
    .select({
      ...SESSION_USER_COLUMNS,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase()))
    .get();

  const valid = row
    ? await verifyUserPassword(body.password, row.passwordHash)
    : false;
  if (!row || !valid) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email or password",
    });
  }

  if (row.bannedAt) {
    throw createError({
      statusCode: 403,
      statusMessage: "This account has been banned.",
    });
  }

  const { passwordHash: _pw, ...sessionUser } = row;
  const { token, expiresAt } = await issueMobileToken(
    event,
    sessionUser.id,
    body.deviceLabel,
  );

  return {
    ok: true,
    token,
    expiresAt,
    user: sessionUser,
  };
});
