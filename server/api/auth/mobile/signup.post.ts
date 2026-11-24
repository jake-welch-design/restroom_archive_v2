import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { hashUserPassword } from "~~/server/utils/hash";
import { issueMobileToken } from "~~/server/utils/mobileToken";
import { rateLimitByIp } from "~~/server/utils/rateLimit";
import { toSessionUser } from "~~/server/utils/sessionUser";
import { validateUsername } from "~~/server/utils/username";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(1).max(40),
  displayName: z.string().min(1).max(25).optional(),
  deviceLabel: z.string().max(80).optional(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "mobile-signup", { max: 5, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);

  const v = validateUsername(body.username);
  if (!v.ok) throw createError({ statusCode: 422, statusMessage: v.reason });

  const email = body.email.toLowerCase();
  const username = v.value;
  const db = useDb(event);

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      or(eq(schema.users.email, email), eq(schema.users.username, username)),
    )
    .get();
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: "That email or username is already taken",
    });
  }

  const passwordHash = await hashUserPassword(body.password);

  const user = await db
    .insert(schema.users)
    .values({
      email,
      username,
      passwordHash,
      displayName: body.displayName ?? null,
    })
    .returning()
    .get();

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
