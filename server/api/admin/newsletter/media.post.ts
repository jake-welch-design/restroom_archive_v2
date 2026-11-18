import { requireRole } from "~~/server/utils/requireRole";
import { useR2 } from "~~/server/utils/r2";

/** Email images have a budget of about 1 MB; this is the hard ceiling. */
const MAX_BYTES = 5_000_000;
const TYPES: Record<string, string> = {
  "image/gif": "gif",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * An image for one issue of the Weekly Report, usually a turntable GIF from the
 * video studio. Kept in the thumbnails bucket under `newsletter/` and served by
 * the thumbnails route, which is public and cached for good: each upload gets
 * a key of its own, so a sent email's image never changes underneath it.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const declared = Number(getHeader(event, "content-length") ?? 0);
  if (declared > MAX_BYTES + 64_000)
    throw createError({
      statusCode: 413,
      statusMessage: "Over the 5 MB limit.",
    });

  // `readFormData`, not `readMultipartFormData`: see submit.post.ts.
  const form = await readFormData(event);
  const file = form.get("file");
  if (!(file instanceof File))
    throw createError({ statusCode: 400, statusMessage: "No file uploaded." });
  const ext = TYPES[file.type];
  if (!ext)
    throw createError({
      statusCode: 415,
      statusMessage: "Upload a GIF, PNG or JPG.",
    });
  if (file.size > MAX_BYTES)
    throw createError({
      statusCode: 413,
      statusMessage: "Over the 5 MB limit.",
    });

  const key = `newsletter/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await useR2(event, "THUMBS").put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return { url: `/api/r2/thumbs/${key}`, bytes: file.size };
});
