import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { verifyPassword } from "~~/server/utils/hash";
import { issueMobileToken } from "~~/server/utils/mobileToken";
import { rateLimitByIp } from "~~/server/utils/rateLimit";
import { toSessionUser } from "~~/server/utils/sessionUser";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceLabel: z.string().max(80).optional(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "mobile-signin", { max: 10, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);
  const db = useDb(event);

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase()))
    .get();

  const valid = user
    ? await verifyPassword(body.password, user.passwordHash)
    : false;
  if (!user || !valid) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid email or password",
    });
  }

  if (user.bannedAt) {
    throw createError({
      statusCode: 403,
      statusMessage: "This account has been banned.",
    });
  }

  const { token, expiresAt } = await issueMobileToken(
    event,
    user.id,
    body.deviceLabel,
  );

  return {
    ok: true,
    token,
    expiresAt,
    user: toSessionUser(user),
  };
});

