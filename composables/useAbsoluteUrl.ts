/**
 * Resolves a path to an absolute URL for use in meta tags and canonical
 * links. Prefers the configured public site URL over the request's own
 * origin: an internal Nitro SSR subrequest can lack the public Host header and
 * otherwise resolve `useRequestURL()` to `http://localhost`.
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
