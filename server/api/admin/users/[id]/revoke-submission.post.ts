import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";

const Body = z.object({
  message: z.string().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

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
      statusMessage: "Cannot revoke an admin",
    });

  await db
    .update(schema.users)
    .set({
      approvedAt: null,
      submissionRequestedAt: null,
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id));

  await recordAdminAction(
    event,
    "user.revoke-submission",
    "user",
    id,
    body.message ? { message: body.message } : undefined,
  );

  return { ok: true };
});
