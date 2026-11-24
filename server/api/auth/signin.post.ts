import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { SESSION_USER_COLUMNS } from "~~/server/utils/sessionUser";
import { verifyUserPassword } from "~~/server/utils/hash";
import { verifyTurnstile } from "~~/server/utils/turnstile";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  email: z.string().email(),
  password: z.string(),
  turnstileToken: z.string(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "signin", { max: 10, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);

  const ok = await verifyTurnstile(event, body.turnstileToken);
  if (!ok)
    throw createError({
      statusCode: 403,
      statusMessage: "Turnstile verification failed",
    });

  const db = useDb(event);

  const row = await db
    .select({
      ...SESSION_USER_COLUMNS,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase()))
    .get();

  // Same error message for missing user and wrong password to prevent enumeration.
  const valid = row
    ? await verifyUserPassword(body.password, row.passwordHash)
    : false;
  if (!row || !valid)
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email or password",
    });

  if (row.bannedAt) {
    throw createError({
      statusCode: 403,
      statusMessage: "This account has been banned.",
    });
  }

  const { passwordHash: _pw, ...sessionUser } = row;
  await setUserSession(event, { user: sessionUser });

  return { ok: true };
});
