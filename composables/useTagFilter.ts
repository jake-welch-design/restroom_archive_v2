/**
 * Case-insensitive comparison for descriptor tags.
 *
 * Tags are stored exactly as the submitter typed them, so "Dim" and "dim" are
 * one filter but two strings. Every comparison in the catalog therefore has to
 * fold case, and doing that consistently is the whole point of this being one
 * function: four components previously carried their own `isTagActive`, and a
 * fifth comparison site in the filter list is what decides whether a chip
 * appears selected.
 *
 * Deliberately not a store. The active tag list belongs to `Catalog.vue`, which
 * owns the filter and passes it down; this only supplies the comparison.
 */
export function useTagFilter() {
  /** Whether `tag` is present in `activeTags`, ignoring case. */
  function isTagActive(tag: string, activeTags: readonly string[]): boolean {
    const needle = tag.toLowerCase();
    return activeTags.some((active) => active.toLowerCase() === needle);
  }

  /**
   * `activeTags` with `tag` added if absent, or removed if present.
   *
   * Returns a new array rather than mutating, so a caller holding the old one
   * for comparison still sees what it had.
   */
  function toggleTag(tag: string, activeTags: readonly string[]): string[] {
    const trimmed = tag.trim();
    if (!trimmed) return [...activeTags];
    return isTagActive(trimmed, activeTags)
      ? removeTag(trimmed, activeTags)
      : [...activeTags, trimmed];
  }

  /** `activeTags` without `tag`, ignoring case. */
  function removeTag(tag: string, activeTags: readonly string[]): string[] {
    const needle = tag.toLowerCase();
    return activeTags.filter((active) => active.toLowerCase() !== needle);
  }

  return { isTagActive, toggleTag, removeTag };
}
