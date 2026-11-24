import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { sendPasswordResetEmail } from "~~/server/utils/email";
import { generateToken, hashToken } from "~~/server/utils/hash";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  email: z.string().email(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "mobile-forgot-password", {
    max: 3,
    windowSec: 3600,
  });

  const body = await readValidatedBody(event, Body.parse);
  const db = useDb(event);
  const email = body.email.toLowerCase();

  const user = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();

  if (!user) return { ok: true };

  const currentUtc = new Date().toISOString().replace("T", " ").slice(0, 19);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  await db.batch([
    db
      .update(schema.passwordResetTokens)
      .set({ usedAt: currentUtc })
      .where(eq(schema.passwordResetTokens.userId, user.id)),
    db.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    }),
  ]);

  try {
    await sendPasswordResetEmail(event, user.email, token);
  } catch {
    // Keep timing and status uniform regardless of mail transport state.
  }

  return { ok: true };
});
