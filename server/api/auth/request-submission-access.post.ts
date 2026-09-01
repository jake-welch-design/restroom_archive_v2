import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { now } from "~~/server/utils/sqlTime";
import { SUBMISSION_AGREEMENTS } from "~~/shared/utils/agreements";

// Checked against the shared list itself, not just its length. A request that
// omits the license grant, or sends six arbitrary strings, is not the agreement
// the archive relies on to publish the scans -- so it is rejected rather than
// counted.
const Body = z.object({
  agreements: z
    .array(z.string())
    .refine(
      (a) =>
        a.length === SUBMISSION_AGREEMENTS.length &&
        SUBMISSION_AGREEMENTS.every((text, i) => a[i] === text),
      "Agreements do not match the current guidelines.",
    ),
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
