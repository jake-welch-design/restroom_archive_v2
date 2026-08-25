import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { getRouterString } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";

const Body = z.object({
  reason: z.string().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "req-removal", { max: 10, windowSec: 86400 });

  const slug = getRouterString(event, "slug");

  const body = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const restroom = await db
    .select({
      id: schema.restrooms.id,
      submittedBy: schema.restrooms.submittedBy,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();

  if (!restroom)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  // The UI only offers this on your own entries; enforce it here too.
  if (restroom.submittedBy !== user.id && user.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only request removal of your own submissions.",
    });
  }

  await db
    .update(schema.restrooms)
    .set({
      removalRequestedBy: user.id,
      removalReason: body.reason ?? null,
      updatedAt: now(),
    })
    .where(eq(schema.restrooms.id, restroom.id));

  return { ok: true };
});
