import { and, eq, ne, sql } from "drizzle-orm";
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

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, "admin");

  const id = getRouterId(event);
  if (id === actor.id)
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot ban yourself",
    });

  const body = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const target = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();

  if (!target)
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  if (target.role === "admin")
    throw createError({
      statusCode: 409,
      statusMessage: "Cannot ban an admin",
    });

  // Batched rather than awaited one after the other, because D1 runs a batch in
  // an implicit transaction. The account's standing and the visibility of its
  // submissions are one fact, and sequential statements let a failure on the
  // second leave a banned account whose scans are still in the archive, with
  // nothing in the audit log to say so.
  await db.batch([
    db
      .update(schema.users)
      .set({
        bannedAt: now(),
        ...adminMessagePatch(body.message),
      })
      .where(eq(schema.users.id, id)),

    // Soft-hide the banned user's submissions so the public archive treats the
    // account's contributions as withdrawn. Hidden rows stay in the DB and R2,
    // and each one carries the status it is leaving into `pre_ban_status`, so
    // lifting the ban puts every entry back where it was instead of guessing.
    // Without that, a `pending` entry would come back published without review
    // and a `removed` one would come back pointing at blobs that were deleted.
    //
    // Rows already hidden are skipped: re-banning an account that is still
    // banned would otherwise record "hidden" as the status to return to.
    db
      .update(schema.restrooms)
      .set({
        status: "hidden",
        // Unqualified on purpose. A single-table UPDATE reads a bare column name
        // as this row's own value, and SQLite evaluates every SET expression
        // against the row as it was before the statement ran.
        preBanStatus: sql`status`,
        updatedAt: now(),
      })
      .where(
        and(
          eq(schema.restrooms.submittedBy, id),
          ne(schema.restrooms.status, "hidden"),
        ),
      ),
  ]);

  await recordAdminAction(
    event,
    "user.ban",
    "user",
    id,
    body.message ? { message: body.message } : undefined,
  );

  return { ok: true };
});
