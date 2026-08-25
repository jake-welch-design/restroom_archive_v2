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

  // A rejected submission is not coming back, so its blobs would otherwise
  // sit in R2 unreferenced forever.
  await deleteRestroomBlobs(event, row);

  await recordAdminAction(
    event,
    "restroom.reject",
    "restroom",
    id,
    message ? { message } : undefined,
  );

  return { ok: true };
});
