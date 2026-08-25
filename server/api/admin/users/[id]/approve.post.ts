import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";
import { readOptionalBody } from "~~/server/utils/validation";

const Body = z.object({
  message: z.string().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readOptionalBody(event, Body);

  const db = useDb(event);

  const row = await db
    .update(schema.users)
    .set({
      approvedAt: now(),
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id })
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  await recordAdminAction(
    event,
    "user.approve",
    "user",
    id,
    body.message ? { message: body.message } : undefined,
  );

  return { ok: true };
});
