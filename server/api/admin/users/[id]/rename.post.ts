import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { validateUsername } from "~~/server/utils/username";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";

const Body = z.object({
  username: z.string().min(1).max(40),
});

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);

  const body = await readValidatedBody(event, Body.parse);
  const v = validateUsername(body.username);
  if (!v.ok) throw createError({ statusCode: 422, statusMessage: v.reason });

  const db = useDb(event);

  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();
  if (!target)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  const collision = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.username, v.value), ne(schema.users.id, id)))
    .get();
  if (collision)
    throw createError({
      statusCode: 409,
      statusMessage: "That username is already taken",
    });

  await db
    .update(schema.users)
    .set({ username: v.value })
    .where(eq(schema.users.id, id));

  await recordAdminAction(event, "user.rename", "user", id, {
    username: v.value,
  });

  return { ok: true, username: v.value };
});
