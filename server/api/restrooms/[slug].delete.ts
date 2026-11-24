import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { getRouterString } from "~~/server/utils/routeParams";
import { deleteRestroomBlobs } from "~~/server/utils/r2";

// Lets a submitter withdraw a pending submission or clear an inactive entry
// from their "My submissions" list. Admins can delete in any state. Both paths
// delete the R2 scan and thumbnail blobs.
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "archivist");

  const slug = getRouterString(event, "slug");

  const db = useDb(event);

  const restroom = await db
    .select({
      id: schema.restrooms.id,
      file: schema.restrooms.file,
      thumbKey: schema.restrooms.thumbKey,
      status: schema.restrooms.status,
      submittedBy: schema.restrooms.submittedBy,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();

  if (!restroom)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  const isOwner = restroom.submittedBy === user.id;
  if (!isOwner && user.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only dismiss your own submissions.",
    });
  }

  const dismissable = ["rejected", "hidden", "pending", "removed"];
  if (
    isOwner &&
    user.role !== "admin" &&
    !dismissable.includes(restroom.status)
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "Published submissions cannot be dismissed directly.",
    });
  }

  // Best effort: an already-missing blob must not stop the row being deleted.
  await deleteRestroomBlobs(event, restroom);

  await db.delete(schema.restrooms).where(eq(schema.restrooms.id, restroom.id));

  return { ok: true };
});
