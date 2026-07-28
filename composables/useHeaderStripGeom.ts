/**
 * Publishes `stripGeom` (see `useStripGeom`) for pages that don't have their
 * own controls strip (About, Account) — the tab simply frames `CatalogHeader`
 * itself, measured the same way Catalog.vue measures its controls/sub-header
 * strip, so it stays accurate across platforms/fonts instead of relying on a
 * hand-tuned constant.
 */
export function useHeaderStripGeom(rootEl: Ref<HTMLElement | null>) {
  const stripGeom = useStripGeom();

  function measure() {
    const root = rootEl.value;
    if (!root) return;
    const header = root.querySelector<HTMLElement>(".catalog-head");
    if (!header) return;
    const rootTop = root.getBoundingClientRect().top;
    const rect = header.getBoundingClientRect();
    const height = rect.bottom - rect.top;
    if (height > 0) stripGeom.value = { top: rect.top - rootTop, height };
  }

  let ro: ResizeObserver | null = null;

  onMounted(() => {
    nextTick(measure);
    ro = new ResizeObserver(() => measure());
    if (rootEl.value) ro.observe(rootEl.value);
    document.fonts?.ready.then(measure).catch(() => {});
  });

  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
  });
}
