/**
 * Escapes the five characters that are unsafe to interpolate into HTML.
 *
 * Needed in two places that both build markup as strings and therefore get no
 * escaping from a template engine: transactional email bodies on the server,
 * and the map's hover popup, which MapLibre takes as a raw HTML string.
 *
 * The ampersand is replaced first. Doing it later would re-escape the
 * ampersands introduced by the other four replacements, turning `<` into
 * `&amp;lt;`.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
