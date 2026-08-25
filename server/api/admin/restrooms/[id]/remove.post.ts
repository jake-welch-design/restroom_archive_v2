import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { deleteRestroomBlobs } from "~~/server/utils/r2";
import { now } from "~~/server/utils/sqlTime";

// Grants a removal request: the entry leaves the archive and the request leaves
// the queue. Deliberately not `reject`, because that status means "this submission
// wasn't accepted", which is the wrong story to tell someone who asked for
// their own scan to be taken down (and it left the request in the queue).
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const db = useDb(event);

  const row = await db
    .update(schema.restrooms)
    .set({
      status: "removed",
      removalRequestedBy: null,
      removalReason: null,
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

  // The point of honouring a removal request is that the scan itself is gone,
  // not merely delisted, so the blobs go the same way a rejection's do.
  await deleteRestroomBlobs(event, row);

  await recordAdminAction(event, "restroom.remove", "restroom", id);

  return { ok: true };
});
