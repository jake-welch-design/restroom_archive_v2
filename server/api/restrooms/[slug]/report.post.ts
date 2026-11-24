import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { notifyAdmins } from "~~/server/utils/notify";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { getRouterString } from "~~/server/utils/routeParams";
import { publicUrls } from "~~/server/utils/urls";
import { readOptionalBody } from "~~/server/utils/validation";

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "report-restroom", { max: 10, windowSec: 3600 });

  const slug = getRouterString(event, "slug");
  const body = await readOptionalBody(event, Body);
  const db = useDb(event);

  const restroom = await db
    .select({
      id: schema.restrooms.id,
      name: schema.restrooms.name,
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

  const inserted = await db
    .insert(schema.restroomReports)
    .values({
      restroomId: restroom.id,
      reporterId: user.id,
      reason: body.reason || null,
    })
    .onConflictDoNothing()
    .returning({ id: schema.restroomReports.id })
    .get();

  if (inserted) {
    const { site } = publicUrls(event);
    await notifyAdmins(event, {
      title: `Restroom reported by @${user.username}`,
      body: body.reason ? `${restroom.name}\n"${body.reason}"` : restroom.name,
      link: `${site}/r/${slug}`,
    });
  }

  return { ok: true };
});
