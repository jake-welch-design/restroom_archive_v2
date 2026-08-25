import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { now } from "~~/server/utils/sqlTime";

const Body = z.object({
  agreements: z.array(z.string()).length(6),
});

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "req-submission", { max: 3, windowSec: 86400 });

  await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  await db
    .update(schema.users)
    .set({ submissionRequestedAt: now() })
    .where(eq(schema.users.id, user.id));

  return { ok: true };
});
