import type { RestroomSummary } from "~/types/restroom";

export function useSelection() {
  const { data } = useRestrooms();
  const route = useRoute();

  // Explicit selection override, set by select() or inferred from the URL slug.
  // Initializer runs synchronously: picks up a deep-linked slug on first render.
  const override = useState<string | null>("selectedSlug", () => {
    const param = route.params.slug as string | undefined;
    return param ?? null;
  });

  // Register the route watcher once per app/request rather than once per caller.
  const routeSynced = useState("selectedSlug:routeSynced", () => false);
  if (!routeSynced.value) {
    routeSynced.value = true;
    watch(
      () => route.params.slug as string | undefined,
      (param) => {
        if (param) override.value = param;
      },
    );
  }

  // Evaluated lazily at render time after async data resolves on the server,
  // so `data.value?.[0]` is available without relying on a watcher.
  const selectedSlug = computed<string | null>(
    () => override.value ?? data.value?.[0]?.slug ?? null,
  );

  const selected = computed<RestroomSummary | null>(() => {
    const slug = selectedSlug.value;
    if (!slug || !data.value?.length) return null;
    return data.value.find((r) => r.slug === slug) ?? null;
  });

  const selectedAnnotationId = useState<number | null>(
    "selectedAnnotationId",
    () => null,
  );

  function select(slug: string) {
    if (slug === selectedSlug.value) return;
    override.value = slug;
    selectedAnnotationId.value = null;
    if (import.meta.client) {
      history.replaceState(history.state, "", `/r/${slug}`);
    }
  }

  function selectAnnotation(id: number | null) {
    selectedAnnotationId.value = id;
  }

  return {
    selectedSlug,
    selected,
    select,
    selectedAnnotationId,
    selectAnnotation,
  };
}
