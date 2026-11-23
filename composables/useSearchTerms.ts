import type { InjectionKey, Ref } from "vue";
import type { SearchTerm } from "~~/shared/utils/catalogSearch";

/**
 * The catalog's current search terms, for `SearchHighlight` to mark matches
 * by. Provided rather than passed down because a listing's text is rendered
 * three components deep (Catalog -> ListView -> DescriptorChips), and a
 * highlight outside the catalog, as in the admin tables, has nothing to mark.
 */
const KEY: InjectionKey<Readonly<Ref<readonly SearchTerm[]>>> =
  Symbol("searchTerms");

export function provideSearchTerms(
  terms: Readonly<Ref<readonly SearchTerm[]>>,
) {
  provide(KEY, terms);
}

export function useSearchTerms(): Readonly<Ref<readonly SearchTerm[]>> {
  return inject(KEY, () => computed(() => []), true);
}
