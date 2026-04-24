import type { Ref } from 'vue'
import type { Annotation } from '~/types/annotation'

export function useAnnotations(slug: Ref<string | null | undefined>) {
  return useFetch<Annotation[]>(
    () => slug.value ? `/api/restrooms/${slug.value}/annotations` : '',
    {
      default: () => [],
      server: false,
      immediate: true,
    },
  )
}
