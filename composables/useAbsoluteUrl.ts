export function useAbsoluteUrl() {
  const reqUrl = useRequestURL();
  function toAbsolute(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path, reqUrl.origin).toString();
  }
  return { toAbsolute };
}
