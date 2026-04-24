import type { RestroomSummary } from '~/types/restroom'

export function useSelection() {
  const { data } = useRestrooms()
  const route = useRoute()

  // Explicit selection override — set by select() or inferred from the URL slug.
  // Initializer runs synchronously: picks up a deep-linked slug on first render.
  const override = useState<string | null>('selectedSlug', () => {
    const param = route.params.slug as string | undefined
    return param ?? null
  })

  // Keep in sync when the user navigates directly to /r/:slug.
  watch(
    () => route.params.slug as string | undefined,
    (param) => { if (param) override.value = param },
  )

  // selectedSlug is a COMPUTED (lazy), not a stored ref.
  // It evaluates at render time — after all async data is resolved on the server —
  // so `data.value?.[0]` is always available without relying on a watcher.
  const selectedSlug = computed<string | null>(
    () => override.value ?? data.value?.[0]?.slug ?? null,
  )

  const selected = computed<RestroomSummary | null>(() => {
    const slug = selectedSlug.value
    if (!slug || !data.value?.length) return null
    return data.value.find((r) => r.slug === slug) ?? null
  })

  function select(slug: string) {
    if (slug === selectedSlug.value) return
    override.value = slug
    selectedAnnotationId.value = null
    if (import.meta.client) {
      history.replaceState(history.state, '', `/r/${slug}`)
    }
  }

  const selectedAnnotationId = useState<number | null>('selectedAnnotationId', () => null)

  function selectAnnotation(id: number | null) {
    selectedAnnotationId.value = id
  }

  return { selectedSlug, selected, select, selectedAnnotationId, selectAnnotation }
}
