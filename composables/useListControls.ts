/**
 * Search-and-sort state for an admin list.
 *
 * Every admin section is the same shape — a list, a substring search over the
 * two or three fields a row is identified by, and a sort with a direction — and
 * each one had grown its own copy of that, or gone without. This holds the
 * state and applies it; the caller supplies the two things that are genuinely
 * per-list: what a search matches against, and how two rows compare on a given
 * key.
 *
 * Searching deliberately does not reorder by relevance, the way the public
 * catalog's fuzzy search does. An admin searching is narrowing a list they
 * still want ordered by whatever they chose, so the sort stays in force and the
 * match is a plain substring test.
 */
import type { MaybeRefOrGetter } from "vue";

export interface ListControlsOptions<T, K extends string> {
  /** The rows to search and sort. A ref, a getter, or a plain array. */
  source: MaybeRefOrGetter<T[] | null | undefined>;
  /**
   * The strings a search query is tested against for one row. Nullish entries
   * are skipped, so a caller can pass an optional field without guarding.
   */
  searchFields: (row: T) => (string | null | undefined)[];
  /**
   * Orders two rows on the active key, ascending. Direction is applied by this
   * composable, so implementations never need to consider it.
   */
  compare: (a: T, b: T, key: K) => number;
  /** Sort key selected on first render. */
  defaultKey: K;
  /**
   * Direction selected on first render. Lists whose natural reading is
   * "newest first" pass `desc`.
   */
  defaultDir?: "asc" | "desc";
}

export function useListControls<T, K extends string>(
  options: ListControlsOptions<T, K>,
) {
  const query = ref("");
  const sortKey = ref(options.defaultKey) as Ref<K>;
  const sortDir = ref<"asc" | "desc">(options.defaultDir ?? "asc");

  const all = computed(() => toValue(options.source) ?? []);

  function matches(row: T, q: string) {
    return options.searchFields(row).some((field) => {
      return typeof field === "string" && field.toLowerCase().includes(q);
    });
  }

  const visible = computed(() => {
    const q = query.value.trim().toLowerCase();
    const filtered = q ? all.value.filter((row) => matches(row, q)) : all.value;

    const dir = sortDir.value === "asc" ? 1 : -1;
    // Copied before sorting: `all` is derived from a `useFetch` result, and
    // sorting in place would mutate the shared cache entry every other consumer
    // of that key is reading.
    return [...filtered].sort(
      (a, b) => options.compare(a, b, sortKey.value) * dir,
    );
  });

  /** True when a search is active and has excluded everything. */
  const isEmptyFromSearch = computed(
    () => Boolean(query.value.trim()) && !visible.value.length,
  );

  return { query, sortKey, sortDir, all, visible, isEmptyFromSearch };
}

/**
 * Compares two SQLite timestamps, oldest first, breaking ties on id.
 *
 * SQLite's `YYYY-MM-DD HH:MM:SS` is fixed-width and big-endian, so a string
 * comparison is a chronological one. The tiebreak is what keeps the order
 * stable: rows written in the same second otherwise shuffle between refreshes.
 */
export function compareStamped(
  a: { id: number },
  b: { id: number },
  aStamp: string | null | undefined,
  bStamp: string | null | undefined,
) {
  // Nulls last, so a list mixing stamped and unstamped rows does not open on a
  // block of blanks.
  if (!aStamp && !bStamp) return a.id - b.id;
  if (!aStamp) return 1;
  if (!bStamp) return -1;
  return aStamp.localeCompare(bStamp) || a.id - b.id;
}
