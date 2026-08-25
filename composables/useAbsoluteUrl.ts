/**
 * Resolves a path to an absolute URL for use in meta tags and canonical
 * links. Prefers the configured public site URL over the request's own
 * origin: a cached route rule (`swr`, `isr`) can be revalidated by an
 * internal Nitro fetch with no real Host header, which otherwise resolves
 * `useRequestURL()` to `http://localhost` and leaks into the rendered page.
 */
export function useAbsoluteUrl() {
  const config = useRuntimeConfig();
  const reqUrl = useRequestURL();
  function toAbsolute(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const origin = config.public.siteUrl || reqUrl.origin;
    return new URL(path, origin).toString();
  }
  return { toAbsolute };
}
