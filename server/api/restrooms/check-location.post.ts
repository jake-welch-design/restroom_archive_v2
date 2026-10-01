import { z } from "zod";
import { requireApproved } from "~~/server/utils/requireApproved";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { coordsMatchLocation } from "~~/server/utils/coordsMatchLocation";
import { isCountryCode } from "~~/shared/utils/regions";

const Body = z.object({
  city: z.string().trim().min(1).max(200),
  country: z.string().refine(isCountryCode),
  subdivision: z.string().max(10).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Asked by the submission wizard before it leaves the details step. `match` is
// null when the check could not be made, which the wizard lets through.
export default defineEventHandler(async (event) => {
  requireApproved(event);
  // Each call is up to two requests to a free geocoder on the archive's name,
  // so the allowance covers a run of corrections and not much more.
  await rateLimitByUser(event, "check-location", { max: 60, windowSec: 3600 });

  const body = await readValidatedBody(event, Body.parse);
  return { match: await coordsMatchLocation(event, body) };
});
