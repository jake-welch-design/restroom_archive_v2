import { useR2 } from "~~/server/utils/r2";
import { getRouterString } from "~~/server/utils/routeParams";

export default defineEventHandler(async (event) => {
  const key = getRouterString(event, "key");

  const thumbs = useR2(event, "THUMBS");

  const object = await thumbs.get(key);
  if (!object)
    throw createError({
      statusCode: 404,
      statusMessage: "Thumbnail not found",
    });

  setHeader(
    event,
    "content-type",
    object.httpMetadata?.contentType ?? "image/jpeg",
  );
  setHeader(event, "cache-control", "public, max-age=31536000, immutable");
  setHeader(event, "etag", object.httpEtag);

  // Same reservation the scans carry, for the same reason. Unlike the models
  // route there is no burst limit here: the grid view requests dozens of
  // thumbnails in one go, so a per-IP limit would throttle ordinary visitors
  // long before it inconvenienced a scraper.
  setHeader(event, "x-robots-tag", "noai, noimageai, noindex");
  setHeader(event, "tdm-reservation", "1");

  return object.body;
});
