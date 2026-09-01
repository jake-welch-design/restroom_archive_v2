import { useR2 } from "~~/server/utils/r2";
import { rateLimitByIp } from "~~/server/utils/rateLimit";

// Fallback streaming route for GLBs served out of the MODELS R2 binding.
//
// Deliberately NOT migrated to an R2 custom domain. Serving straight from the
// CDN edge would be faster, but it bypasses the Worker, and with it the burst
// limit and the AI directives below. This route is the only chokepoint on the
// scans, which is worth more than the latency.
//
// Scan keys are `<slug>.glb` and every slug is published in the sitemap, so the
// URLs are guessable by design -- the archive is meant to be browsable. What
// stops a bulk pull is the burst limit, not obscurity.

/**
 * Per-IP burst limit on scan downloads.
 *
 * Sized to throttle rate, not total volume: a visitor clicking through the
 * catalog never approaches 40 distinct scans in five minutes, and repeat views
 * are served from the browser cache under the immutable Cache-Control below, so
 * they never reach this handler. A scraper pulling the whole archive is the
 * only caller that sustains this rate, and it gets stretched from a ~90 second
 * job into a multi-hour one.
 *
 * Applies to models only. Thumbnails are excluded on purpose: the grid view
 * requests dozens at once, so the same limit there would 429 ordinary visitors.
 */
const SCAN_BURST_LIMIT = { max: 40, windowSec: 300 };

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key");
  if (!key)
    throw createError({ statusCode: 400, statusMessage: "Missing key" });

  // Before the R2 read, so a throttled caller costs a D1 round trip rather than
  // a multi-megabyte object fetch.
  await rateLimitByIp(event, "r2:models", SCAN_BURST_LIMIT);

  const models = useR2(event, "MODELS");

  const object = await models.get(key);
  if (!object)
    throw createError({ statusCode: 404, statusMessage: "Model not found" });

  setHeader(
    event,
    "content-type",
    object.httpMetadata?.contentType ?? "model/gltf-binary",
  );
  setHeader(event, "cache-control", "public, max-age=31536000, immutable");
  setHeader(event, "etag", object.httpEtag);

  // Reserves the scans against text/data mining and model training. Advisory,
  // like robots.txt, and honoured only by crawlers that choose to -- the
  // enforcement is Cloudflare's bot rules at the edge. Its job is to leave no
  // ambiguity about intent, which is what the archive's license rests on.
  setHeader(event, "x-robots-tag", "noai, noimageai, noindex");
  setHeader(event, "tdm-reservation", "1");

  return object.body;
});
