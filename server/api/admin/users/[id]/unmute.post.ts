import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import {
  OptionalMessageBody,
  readOptionalBody,
} from "~~/server/utils/validation";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readOptionalBody(event, OptionalMessageBody);

  const db = useDb(event);

  await db
    .update(schema.users)
    .set({
      mutedUntil: null,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id));

  await recordAdminAction(
    event,
    "user.unmute",
    "user",
    id,
    body.message ? { message: body.message } : undefined,
  );

  return { ok: true };
});
