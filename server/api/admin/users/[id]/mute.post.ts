import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { daysFromNow } from "~~/server/utils/sqlTime";

const Body = z.object({
  days: z.number().int().positive().max(3650),
  message: z.string().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  const actor = requireRole(event, "admin");

  const id = getRouterId(event);
  if (id === actor.id)
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot mute yourself",
    });

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
      statusMessage: "Cannot mute an admin",
    });

  await db
    .update(schema.users)
    .set({
      mutedUntil: daysFromNow(body.days),
      ...adminMessagePatch(body.message),
    })
    .where(eq(schema.users.id, id));

  await recordAdminAction(event, "user.mute", "user", id, {
    days: body.days,
    ...(body.message ? { message: body.message } : {}),
  });

  return { ok: true };
});
