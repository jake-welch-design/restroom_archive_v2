import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { readOptionalBody } from "~~/server/utils/validation";

const Body = z.object({
  message: z.string().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readOptionalBody(event, Body);

  const db = useDb(event);

  // Clear the submission request without deleting the account. The user keeps
  // their annotations and login. Only acts on un-approved users so an active
  // submitter isn't accidentally demoted by a stale click.
  const row = await db
    .update(schema.users)
    .set({
      submissionRequestedAt: null,
      ...adminMessagePatch(body.message),
    })
    .where(and(eq(schema.users.id, id), isNull(schema.users.approvedAt)))
    .returning({ id: schema.users.id })
    .get();

  if (!row)
    throw createError({
      statusCode: 404,
      statusMessage: "User not found or already approved",
    });

  await recordAdminAction(
    event,
    "user.reject",
    "user",
    id,
    body.message ? { message: body.message } : undefined,
  );

  return { ok: true };
});
