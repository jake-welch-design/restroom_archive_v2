/**
 * The size ceiling for an uploaded .glb scan.
 *
 * Shared rather than declared in the endpoint because the wizard has to reject
 * an oversized scan *before* it is sent. That is not a convenience: on
 * Cloudflare, a scan large enough to matter kills the Worker before any server
 * check can answer, so the browser is the only place a clear error can still be
 * produced. Two copies of this number would mean the client waving through a
 * file the server cannot survive.
 *
 * ## Why 25 MB and not 50
 *
 * The number is dictated by Cloudflare's 128 MB isolate limit, not by what a
 * scan "should" weigh. Uploading N bytes through this stack costs several times
 * N in Worker memory, and two multipliers stack:
 *
 * 1. Nitro's `cloudflare-pages` preset eagerly buffers every POST body before
 *    any app code runs -- `body = Buffer.from(await request.arrayBuffer())`, in
 *    `nitropack/dist/presets/cloudflare/runtime/cloudflare-pages.mjs`. Its
 *    `requestHasBody` check tests only the HTTP method, so there is no route,
 *    content type or size that opts out of it. That alone is ~2N.
 * 2. Parsing the multipart body adds the rest. h3's `readMultipartFormData` was
 *    the expensive one -- see the note in `server/api/restrooms/submit.post.ts`
 *    for why this endpoint no longer uses it.
 *
 * With native multipart parsing the total lands around 3N, which leaves 25 MB
 * comfortably inside the limit once the Nuxt/Nitro isolate's own baseline is
 * paid for. The previous 50 MB was never real: measured peak heap for h3's
 * parser alone was 123 MB at a 4 MB upload and 812 MB at 24 MB, so the true
 * ceiling was around 4 MB and every larger upload died as an opaque 503.
 *
 * Raising this is safe up to roughly 30 MB. Past that the preset's own eager
 * buffering becomes the binding constraint and no amount of careful parsing
 * helps -- getting to 50 MB+ means keeping the bytes out of the Worker
 * altogether, via a presigned direct-to-R2 PUT.
 *
 * ## Decimal MB, not MiB, and on purpose
 *
 * 25 * 1000 * 1000 rather than 25 * 1024 * 1024, so that the cap is on the same
 * scale as the sizes {@link formatFileSize} prints and as Finder shows. Defined
 * in MiB it was off by the 4.9% between the two units, which is small enough to
 * look like a bug rather than a rounding difference: a 25 MiB scan was refused
 * with "This scan is 26.2 MB, over the 25 MB limit." The exact ceiling is
 * arbitrary anyway -- it is chosen for memory headroom, not to be a round
 * power of two -- so the units that make the message read correctly win.
 */
export const MAX_GLB_BYTES = 25 * 1000 * 1000;

/** The ceiling as whole megabytes, for use in messages shown to a submitter. */
export const MAX_GLB_MB = Math.round(MAX_GLB_BYTES / 1000 / 1000);

/**
 * A file size a submitter can act on, e.g. "68.4 MB".
 *
 * Decimal MB, matching both the size the operating system's file browser shows
 * and {@link MAX_GLB_BYTES} -- the three have to agree for a message that
 * quotes a size against the limit to make sense.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1000 / 1000).toFixed(1)} MB`;
}
