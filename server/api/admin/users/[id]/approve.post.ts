import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { adminMessagePatch } from "~~/server/utils/adminMessage";
import { recordAdminAction } from "~~/server/utils/auditLog";

const Body = z.object({
  message: z.string().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = Number(getRouterParam(event, "id"));
  if (!id) throw createError({ statusCode: 400, statusMessage: "Invalid id" });

  const body = await readValidatedBody(event, async (raw) => {
    if (raw == null) return {};
    return Body.parse(raw);
  });

  const db = useDb(event);

  const row = await db
    .update(schema.users)
    .set({
      approvedAt: sql`(datetime('now'))`,
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
