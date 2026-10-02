import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";

// Required here, unlike on the moderation actions, where the note is optional:
// the note is the whole of this action, so an empty one is a request to do
// nothing. Trimmed first so whitespace does not count as a message.
const Body = z.object({
  message: z.string().trim().min(1).max(500),
});

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

  await db
    .update(schema.users)
    .set(adminMessagePatch(body.message))
    .where(eq(schema.users.id, id));

  await recordAdminAction(event, "user.message", "user", id, {
    message: body.message,
  });

  return { ok: true };
});
