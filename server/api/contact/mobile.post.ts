import { z } from "zod";
import { sendContactEmail } from "~~/server/utils/email";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event, "mobile-contact", { max: 3, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);

  await sendContactEmail(event, body);

  return { ok: true };
});
