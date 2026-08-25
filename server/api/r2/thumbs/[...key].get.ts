import { useR2 } from "~~/server/utils/r2";
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key");
  if (!key)
    throw createError({ statusCode: 400, statusMessage: "Missing key" });

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

  return object.body;
});
