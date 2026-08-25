import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";

// ~1.5 MB decoded; base64 overhead is ~4/3 so cap the string at ~2 MB.
const MAX_IMAGE_BASE64_CHARS = 2_000_000;

const IMAGE_DATA_RE = /^data:image\/(jpeg|png|webp);base64,/;

function isValidImageMagic(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return true;
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.length >= 12 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return true;
  return false;
}

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const slug = getRouterParam(event, "slug");
  if (!slug)
    throw createError({ statusCode: 400, statusMessage: "Missing slug" });

  const { imageData } = await readValidatedBody(
    event,
    z.object({
      imageData: z
        .string()
        .regex(IMAGE_DATA_RE, "Invalid image data URI")
        .max(MAX_IMAGE_BASE64_CHARS, "Image too large"),
    }).parse,
  );

  const base64 = imageData.replace(IMAGE_DATA_RE, "");
  const buffer = Buffer.from(base64, "base64");

  if (!isValidImageMagic(buffer)) {
    throw createError({
      statusCode: 422,
      statusMessage: "File is not a valid image",
    });
  }
  const thumbKey = `${slug}.jpg`;

  const env = event.context.cloudflare?.env as
    { THUMBS?: R2Bucket } | undefined;
  if (!env?.THUMBS)
    throw createError({
      statusCode: 500,
      statusMessage: "THUMBS bucket not available",
    });

  await env.THUMBS.put(thumbKey, buffer, {
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  const db = useDb(event);
  await db
    .update(schema.restrooms)
    .set({ thumbKey })
    .where(eq(schema.restrooms.slug, slug));

  return { ok: true };
});
