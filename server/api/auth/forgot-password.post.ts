import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { generateToken, hashToken } from "~~/server/utils/hash";
import { sendPasswordResetEmail } from "~~/server/utils/email";
import { verifyTurnstile } from "~~/server/utils/turnstile";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  email: z.string().email(),
  turnstileToken: z.string(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "forgot-password", { max: 5, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);

  const ok = await verifyTurnstile(event, body.turnstileToken);
  if (!ok)
    throw createError({
      statusCode: 403,
      statusMessage: "Turnstile verification failed",
    });

  const db = useDb(event);
  const email = body.email.toLowerCase();

  const user = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();

  // Always 200 — don't leak whether the email is registered.
  if (!user) return { ok: true };

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  // Invalidate any existing unused tokens so only the latest link works.
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(schema.passwordResetTokens.userId, user.id));

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  await db.insert(schema.passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  try {
    await sendPasswordResetEmail(user.email, token);
  } catch {
    // Don't tell the client the email send failed — still return ok.
  }

  return { ok: true };
});
