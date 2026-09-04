import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { deleteRestroomBlobs } from "~~/server/utils/r2";
import { now } from "~~/server/utils/sqlTime";
import { readOptionalBody } from "~~/server/utils/validation";

const Body = z.object({
  message: z.string().trim().max(500).optional(),
});

/** The only two states an entry can be taken down from. */
const REMOVABLE = ["published", "hidden"];

/**
 * Takes an entry out of the archive and deletes its scan.
 *
 * Serves both directions of the same outcome:
 *
 * - Granting a submitter's removal request, from the Removals queue. They asked,
 *   so no explanation is owed and `message` may be omitted.
 * - An admin taking an entry down on their own initiative, from the Archive list
 *   or an account's submissions. Nobody asked, so `message` is required: it is
 *   the only thing the submitter will see where their entry used to be.
 *
 * Deliberately not `reject`, because that status means "this submission wasn't
 * accepted", which is the wrong story to tell about an entry that was in the
 * archive.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readOptionalBody(event, Body);
  const message = body.message || null;

  const db = useDb(event);

  const target = await db
    .select({
      status: schema.restrooms.status,
      removalRequestedBy: schema.restrooms.removalRequestedBy,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.id, id))
    .get();

  if (!target)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  if (!REMOVABLE.includes(target.status)) {
    throw createError({
      statusCode: 409,
      statusMessage:
        target.status === "pending"
          ? "Pending submissions are rejected, not removed."
          : `A ${target.status} entry is not in the archive.`,
    });
  }

  // Whether this grants a request decides who is owed an explanation. Read from
  // the row rather than trusted from the caller, so the requirement cannot be
  // sidestepped by posting straight at the endpoint.
  const granted = target.removalRequestedBy != null;

  if (!granted && !message) {
    throw createError({
      statusCode: 400,
      statusMessage: "A reason is required when removing an entry.",
    });
  }

  const row = await db
    .update(schema.restrooms)
    .set({
      status: "removed",
      // `removalRequestedBy` and `removalReason` are left alone: they are the
      // record of who asked, which the submitter's own list reads back to tell
      // "removed at your request" apart from "removed by an admin". The queue
      // drops the row on status instead of on this column being cleared.
      removalMessage: message,
      updatedAt: now(),
    })
    .where(eq(schema.restrooms.id, id))
    .returning({
      id: schema.restrooms.id,
      file: schema.restrooms.file,
      thumbKey: schema.restrooms.thumbKey,
    })
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  // The point of a removal is that the scan itself is gone, not merely
  // delisted, so the blobs go the same way a rejection's do.
  await deleteRestroomBlobs(event, row);

  await recordAdminAction(event, "restroom.remove", "restroom", id, {
    granted,
    ...(message ? { message } : {}),
  });

  return { ok: true };
});
