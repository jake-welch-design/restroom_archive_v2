import type { H3Event } from "h3";

/** The R2 buckets bound in wrangler.toml. */
export type R2BindingName = "MODELS" | "THUMBS";

type CloudflareBuckets = Partial<Record<R2BindingName, R2Bucket>>;

function buckets(event: H3Event): CloudflareBuckets {
  return (event.context.cloudflare?.env ?? {}) as CloudflareBuckets;
}

/**
 * The R2 bucket behind a binding, or a 500 if it is not present.
 *
 * The counterpart to `useDb` in server/utils/db.ts, and it fails the same way
 * and for the same reason: a missing binding means the process is not running
 * under a Cloudflare environment at all, which no request-level handling can
 * recover from.
 *
 * Use this wherever the bucket is required for the request to mean anything,
 * such as storing an upload or streaming a model back. For cleanup that must
 * not fail the request, use {@link deleteRestroomBlobs}.
 */
export function useR2(event: H3Event, binding: R2BindingName): R2Bucket {
  const bucket = buckets(event)[binding];
  if (!bucket) {
    throw createError({
      statusCode: 500,
      statusMessage: `R2 binding "${binding}" not available.`,
    });
  }
  return bucket;
}

/**
 * Removes a restroom's stored scan and thumbnail, best effort.
 *
 * Called on the three paths that retire an entry: an admin rejecting a pending
 * submission, an admin honouring a removal request, and a submitter dismissing
 * their own. All three want the blobs gone so storage does not accumulate
 * orphans, and none of them should fail because a blob was already missing or
 * because the binding is absent in a local run.
 *
 * Resolves once every deletion has settled, successfully or otherwise. It never
 * rejects, so callers can await it without a guard.
 */
export async function deleteRestroomBlobs(
  event: H3Event,
  blobs: { file?: string | null; thumbKey?: string | null },
): Promise<void> {
  const { MODELS, THUMBS } = buckets(event);

  await Promise.allSettled([
    blobs.file && MODELS ? MODELS.delete(blobs.file) : undefined,
    blobs.thumbKey && THUMBS ? THUMBS.delete(blobs.thumbKey) : undefined,
  ]);
}
