import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { getRouterString } from "~~/server/utils/routeParams";

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "report-restroom", { max: 10, windowSec: 3600 });

  const slug = getRouterString(event, "slug");
  const body = await readValidatedBody(event, (raw) => Body.parse(raw ?? {}));
  const db = useDb(event);

  const restroom = await db
    .select({
      id: schema.restrooms.id,
      submittedBy: schema.restrooms.submittedBy,
    })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();

  if (!restroom) {
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });
  }
  if (restroom.submittedBy === user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Use the removal request option for your own submission.",
    });
  }

  await db
    .insert(schema.restroomReports)
    .values({
      restroomId: restroom.id,
      reporterId: user.id,
      reason: body.reason || null,
    })
    .onConflictDoNothing();

  return { ok: true };
});

