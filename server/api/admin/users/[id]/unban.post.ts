import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

const Body = z.object({
  message: z.string().max(500).optional(),
});

/**
 * Lifts a ban: the account signs in again and its submissions return.
 *
 * The mirror of ban.post.ts, and the reason that handler records
 * `pre_ban_status`. Restoring is not "publish everything they submitted" — the
 * account may have had entries awaiting review, rejected, or removed on request
 * — so each row goes back to the status the ban took it from.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();

  if (!target)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  // No check that the account is actually banned, and no self guard: clearing a
  // null column is a no-op, and an admin cannot have banned themselves.
  await db
    .update(schema.users)
    .set({
      bannedAt: null,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id));

  // Only rows this account's ban hid carry a `pre_ban_status`, so the filter is
  // what keeps an entry an admin hid or removed on its own terms out of the
  // restore. Both assignments read the pre-update row, so `status` takes the
  // saved value even though the same statement clears it.
  await db
    .update(schema.restrooms)
    .set({
      status: sql`pre_ban_status`,
      preBanStatus: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(schema.restrooms.submittedBy, id),
        isNotNull(schema.restrooms.preBanStatus),
      ),
    );

  await recordAdminAction(
    event,
    "user.unban",
    "user",
    id,
    body.message ? { message: body.message } : undefined,
  );

  return { ok: true };
});
