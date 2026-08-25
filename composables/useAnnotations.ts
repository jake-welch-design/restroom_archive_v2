import type { Ref } from "vue";
import type { Annotation } from "~/types/annotation";

export function useAnnotations(slug: Ref<string | null | undefined>) {
  // `watch: false` because the fetch is driven explicitly below. Letting useFetch's
  // own reactive-URL tracking fire automatically would issue a request even when
  // slug goes falsy (e.g. an in-progress submission preview with no restroom
  // yet), and an empty request string resolves relative to the current page,
  // returning its HTML instead of an annotations array.
  const result = useFetch<Annotation[]>(
    () => `/api/restrooms/${slug.value}/annotations`,
    {
      default: () => [],
      server: false,
      immediate: !!slug.value,
      watch: false,
    },
  );

  watch(slug, (value) => {
    if (value) result.execute();
    else result.data.value = [];
  });

  return result;
}
