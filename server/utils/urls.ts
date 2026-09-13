import type { H3Event } from "h3";

export function publicUrls(event: H3Event) {
  const config = useRuntimeConfig(event);
  const origin = getRequestURL(event).origin;
  return {
    models: config.public.modelsBaseUrl || `${origin}/api/r2/models`,
    thumbs: config.public.thumbsBaseUrl || `${origin}/api/r2/thumbs`,
    site: config.public.siteUrl || origin,
  };
}

/**
 * A restroom's thumbnail URL, versioned against the row's last write.
 *
 * Thumbnails are stored at a stable `<slug>.jpg` key and served
 * `cache-control: public, max-age=31536000, immutable`, which is right for the
 * usual case: a thumbnail is captured once and never changes, and the grid view
 * asks for dozens at a time.
 *
 * Cropping breaks that assumption. It re-renders the thumbnail at the new
 * framing and overwrites the same key, so without a version in the URL the
 * corrected image would sit behind a year-long immutable cache and every
 * visitor -- including the admin who just cropped it -- would keep seeing the
 * old framing.
 *
 * `updated_at` is the version because it already moves on every write to the
 * row, the crop included. Relative, like the rest of the URLs these endpoints
 * return; the client resolves it against `document.baseURI`.
 */
export function versionedThumbUrl(
  thumbKey: string | null,
  updatedAt: string | null,
): string | null {
  if (!thumbKey) return null;
  const version = (updatedAt ?? "").replace(/\D/g, "");
  const base = `/api/r2/thumbs/${thumbKey}`;
  return version ? `${base}?v=${version}` : base;
}
