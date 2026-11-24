import { eq, and, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { hashUserPassword, hashToken } from "~~/server/utils/hash";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "reset-password", { max: 10, windowSec: 3600 });

  const { token, password } = await readValidatedBody(event, Body.parse);
  const tokenHash = hashToken(token);
  const db = useDb(event);

  const currentUtc = new Date().toISOString().replace("T", " ").slice(0, 19);

  const row = await db
    .select({
      id: schema.passwordResetTokens.id,
      userId: schema.passwordResetTokens.userId,
    })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, currentUtc),
      ),
    )
    .get();

  if (!row) {
    throw createError({
      statusCode: 400,
      statusMessage: "This reset link is invalid or has expired.",
    });
  }

  const newHash = await hashUserPassword(password);

  // Batch the password update, token consumption, and revocation of existing
  // mobile bearer tokens so a reset cannot leave the token reusable or old
  // device sessions active.
  await db.batch([
    db
      .update(schema.users)
      .set({ passwordHash: newHash })
      .where(eq(schema.users.id, row.userId)),
    db
      .update(schema.passwordResetTokens)
      .set({ usedAt: currentUtc })
      .where(eq(schema.passwordResetTokens.id, row.id)),
    db.delete(schema.apiTokens).where(eq(schema.apiTokens.userId, row.userId)),
  ]);

  return { ok: true };
});
