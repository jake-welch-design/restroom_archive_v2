import { z } from "zod";
import { sendContactEmail } from "~~/server/utils/email";
import { verifyTurnstile } from "~~/server/utils/turnstile";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  turnstileToken: z.string(),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "contact", { max: 5, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);

  const ok = await verifyTurnstile(event, body.turnstileToken);
  if (!ok)
    throw createError({
      statusCode: 403,
      statusMessage: "Turnstile verification failed",
    });

  await sendContactEmail(body);

  return { ok: true };
});
