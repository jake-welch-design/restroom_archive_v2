import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { hashPassword } from "~~/server/utils/hash";
import { verifyTurnstile } from "~~/server/utils/turnstile";
import { validateUsername } from "~~/server/utils/username";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(1).max(40),
  displayName: z.string().min(1).max(25).optional(),
  turnstileToken: z.string(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "signup", { max: 5, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);

  const ok = await verifyTurnstile(event, body.turnstileToken);
  if (!ok)
    throw createError({
      statusCode: 403,
      statusMessage: "Turnstile verification failed",
    });

  const v = validateUsername(body.username);
  if (!v.ok) throw createError({ statusCode: 422, statusMessage: v.reason });

  const email = body.email.toLowerCase();
  const username = v.value;
  const db = useDb(event);

  // Single query for both collisions so the response time doesn't tell the
  // attacker which field is taken.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      or(eq(schema.users.email, email), eq(schema.users.username, username)),
    )
    .get();
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: "That email or username is already taken",
    });

  const passwordHash = await hashPassword(body.password);

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

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      submissionRequestedAt: user.submissionRequestedAt ?? null,
      approvedAt: user.approvedAt ?? null,
      mutedUntil: user.mutedUntil ?? null,
      bannedAt: user.bannedAt ?? null,
      adminMessage: user.adminMessage ?? null,
      adminMessageAt: user.adminMessageAt ?? null,
    },
  });

  return { ok: true };
});
