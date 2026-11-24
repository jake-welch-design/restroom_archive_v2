import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { verifyUserPassword } from "~~/server/utils/hash";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import {
  findPlunkContact,
  isWeeklyReportSubscriber,
  plunkConfigured,
  setWeeklyReportSubscription,
} from "~~/server/utils/plunk";

const Body = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "change-email", { max: 5, windowSec: 3600 });

  const { email, currentPassword } = await readValidatedBody(event, Body.parse);
  const nextEmail = email.toLowerCase().trim();

  const db = useDb(event);
  const row = await db
    .select({
      email: schema.users.email,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Account not found" });

  const ok = await verifyUserPassword(currentPassword, row.passwordHash);
  if (!ok)
    throw createError({
      statusCode: 401,
      statusMessage: "Password is incorrect",
    });

  if (nextEmail === row.email) return { ok: true, email: nextEmail };

  // Friendly duplicate check; the unique index is the real guard against races.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, nextEmail))
    .get();
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: "That email is already in use",
    });

  try {
    await db
      .update(schema.users)
      .set({ email: nextEmail, emailVerifiedAt: null })
      .where(eq(schema.users.id, user.id));
  } catch {
    throw createError({
      statusCode: 409,
      statusMessage: "That email is already in use",
    });
  }

  await moveWeeklyReport(event, row.email, nextEmail);

  return { ok: true, email: nextEmail };
});

/**
 * The Weekly Report follows the account to its new address, so the Profile
 * tab's Newsletter row stays true and the old inbox stops getting it.
 * Best effort: the email has already changed, and a Plunk hiccup here is not
 * worth failing that over. The row would then read "Not subscribed" and can be
 * fixed from there.
 */
async function moveWeeklyReport(
  event: Parameters<typeof plunkConfigured>[0],
  from: string,
  to: string,
) {
  if (!plunkConfigured(event)) return;
  try {
    if (!isWeeklyReportSubscriber(await findPlunkContact(event, from))) return;
    await setWeeklyReportSubscription(event, to, true);
    await setWeeklyReportSubscription(event, from, false);
  } catch (e) {
    console.error("[weekly-report] moving subscription on email change", e);
  }
}
