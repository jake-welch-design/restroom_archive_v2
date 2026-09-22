import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireApproved } from "~~/server/utils/requireApproved";
import { serializeDescriptors } from "~~/server/utils/descriptors";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { useR2 } from "~~/server/utils/r2";
import { notifyAdmins } from "~~/server/utils/notify";
import { publicUrls } from "~~/server/utils/urls";
import {
  MAX_GLB_BYTES,
  MAX_GLB_MB,
  formatFileSize,
} from "~~/shared/utils/uploadLimits";
import { isCountryCode } from "~~/shared/utils/regions";

// Where a notification about a new submission sends the admin who taps it.
// The account page reads tab, group and section off the query string, so this
// opens straight onto the pending queue rather than the remembered position.
const PENDING_QUEUE_PATH =
  "/account?tab=admin&group=submissions&section=pending";

/**
 * Headroom above {@link MAX_GLB_BYTES} for the rest of the multipart envelope
 * when checking `Content-Length`, which covers the whole request body rather
 * than the scan inside it.
 *
 * Every other field is individually capped by `MetaSchema` -- the largest are
 * `descriptors` at 2000 characters and `description` at 1000 -- so the real
 * overhead is a few kilobytes of boundaries and headers. 64 KB is well clear of
 * that while staying far too small to let an oversized scan through.
 */
const MULTIPART_OVERHEAD_ALLOWANCE = 64 * 1024;

// GLB binary format starts with "glTF" magic (0x46546C67 little-endian).
function isGlb(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46
  );
}

const MetaSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  // Checked against the list the wizard's select is built from, so the column
  // can only ever hold a code the archive recognises. `location` is the display
  // string composed alongside it and is not parsed back into a country.
  country: z
    .string()
    .refine(isCountryCode, "Please choose a country from the list"),
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

  // Refused on the declared length, before the body is parsed.
  //
  // This is not the real size check -- `Content-Length` describes the whole
  // multipart envelope rather than the scan inside it, and a client is free to
  // misreport it. What it buys is refusing an oversized upload before the parse
  // allocates anything for it, and doing so with a status a submitter can
  // act on.
  //
  // It cannot catch every oversized upload, and it is important to know why.
  // Nitro's `cloudflare-pages` preset has already buffered the entire body into
  // memory by the time this handler runs, so a request several times the limit
  // exhausts the isolate inside the preset and never reaches this line -- the
  // failure Cloudflare reports for that is a bare 503 with no response of ours
  // attached. That is why the wizard also checks the size in the browser: above
  // a certain size the client is the only place left that can explain itself.
  // See shared/utils/uploadLimits.ts for the memory arithmetic.
  const declaredLength = Number(getHeader(event, "content-length") ?? 0);
  if (declaredLength > MAX_GLB_BYTES + MULTIPART_OVERHEAD_ALLOWANCE)
    throw createError({
      statusCode: 413,
      statusMessage: `This upload is ${formatFileSize(declaredLength)}, over the ${MAX_GLB_MB} MB limit.`,
    });

  // `readFormData` rather than `readMultipartFormData`, deliberately.
  //
  // h3's `readMultipartFormData` parses the body in a byte-by-byte JavaScript
  // loop that pushes each byte into a plain array, then copies that array
  // twice. Measured peak heap was ~30x the upload: 123 MB for a 4 MB scan,
  // 812 MB for a 24 MB one. Against Cloudflare's 128 MB isolate limit that put
  // the real ceiling near 4 MB, and every scan above it was killed mid-request
  // and surfaced to the submitter as an unexplained 503.
  //
  // `readFormData` hands the body to the runtime's own multipart parser, which
  // does not pay that multiplier. Do not switch this back.
  const form = await readFormData(event);
  const file = form.get("file");

  // `Blob` rather than `File`: a File is a Blob, this is all the code needs of
  // it, and it does not depend on a `File` global being present in whichever
  // runtime is serving the request.
  if (!(file instanceof Blob) || file.size === 0)
    throw createError({
      statusCode: 400,
      statusMessage: "GLB file is required",
    });

  if (file.size > MAX_GLB_BYTES)
    throw createError({
      statusCode: 413,
      statusMessage: `This scan is ${formatFileSize(file.size)}, over the ${MAX_GLB_MB} MB limit.`,
    });

  // Only the first four bytes are needed to recognise a GLB, and reading them
  // from a slice leaves the rest of the scan where it is. Reading the whole
  // file into a Buffer here would reintroduce exactly the allocation that
  // `readFormData` above exists to avoid; the Blob is handed to R2 untouched.
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!isGlb(magic))
    throw createError({
      statusCode: 422,
      statusMessage: "File is not a valid GLB model",
    });

  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key !== "file" && typeof value === "string") fields[key] = value;
  }

  const meta = MetaSchema.safeParse(fields);
  if (!meta.success) {
    throw createError({
      statusCode: 422,
      statusMessage: meta.error.issues[0]?.message ?? "Invalid fields",
    });
  }

  const {
    name,
    location,
    country,
    isoDate,
    lat,
    lng,
    description,
    descriptors,
  } = meta.data;
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

  // The Blob goes to R2 as-is. `put` accepts one and reads its size directly,
  // so the scan is never materialised as a Buffer in the isolate's heap.
  await models.put(fileKey, file, {
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
      country,
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

  // Only entries that actually land in the queue are worth a notification. An
  // admin's own submission publishes straight away, so there is nothing to go
  // and review. Best-effort by design: `notifyAdmins` swallows its own
  // failures, so a notification that does not send cannot lose a submission
  // that did.
  if (row.status === "pending") {
    // `publicUrls` falls back to the request origin, so the tap target is a
    // usable absolute URL in dev as well as production -- the previous
    // `siteUrl || ""` dropped the link entirely whenever the var was unset.
    const { site } = publicUrls(event);
    // The title names the submitter; the restroom's name and location are the
    // link into the queue.
    await notifyAdmins(event, {
      title: `New submission from @${user.username}`,
      body: `${name}\n${location}`,
      link: `${site}${PENDING_QUEUE_PATH}`,
    });
  }

  return { ok: true, slug: row.slug };
});
