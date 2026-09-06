import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";
import { readOptionalBody } from "~~/server/utils/validation";

const Body = z.object({
  message: z.string().trim().max(500).optional(),
});

/**
 * Turns a submission down, reversibly for a while.
 *
 * The scan is kept rather than deleted here, and `rejected_at` starts the clock
 * the sweep in `server/utils/purgeRejections.ts` reads. Rejection used to take
 * the blobs on the spot, which made a misclick unrecoverable: the row survived
 * but pointed at nothing, so there was no honest way to put the entry back.
 *
 * `scan_purged_at` is deliberately not reset. It is only ever set on an entry
 * whose scan has already been deleted, and clearing it would advertise a
 * restore that would produce an entry with no model behind it.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readOptionalBody(event, Body);
  const message = body.message ?? null;

  const db = useDb(event);

  const row = await db
    .update(schema.restrooms)
    .set({
      status: "rejected",
      rejectionMessage: message || null,
      rejectedAt: now(),
      updatedAt: now(),
    })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id })
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  await recordAdminAction(
    event,
    "restroom.reject",
    "restroom",
    id,
    message ? { message } : undefined,
  );

  return { ok: true };
});
