import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireApproved } from "~~/server/utils/requireApproved";
import { serializeDescriptors } from "~~/server/utils/descriptors";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { useR2 } from "~~/server/utils/r2";

const MAX_GLB_BYTES = 50 * 1024 * 1024; // 50 MB

// GLB binary format starts with "glTF" magic (0x46546C67 little-endian).
function isGlb(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x67 &&
    buf[1] === 0x6c &&
    buf[2] === 0x54 &&
    buf[3] === 0x46
  );
}

const MetaSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  isoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  // Required, matching the wizard: a whitespace-only body is not a description,
  // so trim before the length check rather than after storing it.
  description: z
    .string({ required_error: "Description is required" })
    .trim()
    .min(1, "Description is required")
    .max(1000),
  descriptors: z.string().max(2000).optional(),
});

function toSlug(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDisplayDate(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export default defineEventHandler(async (event) => {
  const user = requireApproved(event);
  await rateLimitByUser(event, "submit", { max: 10, windowSec: 86400 });

  const parts = await readMultipartFormData(event);
  if (!parts)
    throw createError({
      statusCode: 400,
      statusMessage: "Expected multipart form data",
    });

  const fields: Record<string, string> = {};
  let glbPart: { data: Buffer; filename?: string } | null = null;

  for (const part of parts) {
    if (!part.name) continue;
    if (part.name === "file") {
      glbPart = { data: part.data, filename: part.filename };
    } else {
      fields[part.name] = part.data.toString("utf-8");
    }
  }

  if (!glbPart?.data.length)
    throw createError({
      statusCode: 400,
      statusMessage: "GLB file is required",
    });
  if (glbPart.data.length > MAX_GLB_BYTES)
    throw createError({
      statusCode: 413,
      statusMessage: `GLB file must be under ${MAX_GLB_BYTES / 1024 / 1024} MB`,
    });
  if (!isGlb(glbPart.data))
    throw createError({
      statusCode: 422,
      statusMessage: "File is not a valid GLB model",
    });

  const meta = MetaSchema.safeParse(fields);
  if (!meta.success) {
    throw createError({
      statusCode: 422,
      statusMessage: meta.error.issues[0]?.message ?? "Invalid fields",
    });
  }

  const { name, location, isoDate, lat, lng, description, descriptors } =
    meta.data;
  let descriptorTags: string[] = [];
  if (descriptors) {
    try {
      const parsed = JSON.parse(descriptors);
      if (Array.isArray(parsed))
        descriptorTags = parsed.filter(
          (t): t is string => typeof t === "string" && t.length <= 40,
        );
    } catch {
      /* ignore malformed */
    }
  }
  const slug = `${isoDate}-${toSlug(name)}`;
  const fileKey = `${slug}.glb`;

  const db = useDb(event);

  const existing = await db
    .select({ id: schema.restrooms.id })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: "A restroom with this name/location/date already exists",
    });

  const models = useR2(event, "MODELS");

  await models.put(fileKey, glbPart.data, {
    httpMetadata: {
      contentType: "model/gltf-binary",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  const row = await db
    .insert(schema.restrooms)
    .values({
      name,
      slug,
      location,
      date: formatDisplayDate(isoDate),
      isoDate,
      coords:
        lat != null && lng != null
          ? `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)} ${lng >= 0 ? "E" : "W"}`
          : "",
      lat: lat ?? null,
      lng: lng ?? null,
      file: fileKey,
      description,
      descriptors: serializeDescriptors(descriptorTags),
      status: user.role === "admin" ? "published" : "pending",
      submittedBy: user.id,
    })
    .returning()
    .get();

  return { ok: true, slug: row.slug };
});
