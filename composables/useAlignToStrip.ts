/**
 * Grows a page's first bordered header row so its bottom border lands exactly
 * on the bottom of the layout's `.expand-tab`.
 *
 * This is the mirror image of what `Catalog.vue` does. There, the controls
 * strip is the source of truth and the tab measures itself against it. Pages
 * with no controls strip of their own (About, Account) leave the tab where it
 * is and align *to* it instead — same idea either way: measure the real
 * rendered geometry rather than matching it with hand-tuned constants that
 * drift across platforms and fonts.
 *
 * Returns a style object for the page root; the row consumes it as
 * `min-height: var(--strip-align-height)`. `min-height` (not `height`) so the
 * row only ever grows to reach the tab — content taller than the strip keeps
 * its natural height instead of being clipped. Mobile drops the var entirely,
 * since the tab moves to the bottom edge of the panel there and has no strip
 * to line up with.
 */
export function useAlignToStrip(
  rootEl: Ref<HTMLElement | null>,
  targetEl: Ref<HTMLElement | null>,
) {
  const stripGeom = useStripGeom();
  const alignHeight = ref(0);

  function measure() {
    const root = rootEl.value;
    const target = targetEl.value;
    if (!root || !target) return;
    const top =
      target.getBoundingClientRect().top - root.getBoundingClientRect().top;
    // `stripGeom.height` runs to the *outer* edge of the strip's 1px bottom
    // border, and `.expand-tab` trims that 1px off its own height — so the tab
    // ends level with the top of the border, and the row has to reach the
    // outer edge for its border to sit in the same place Catalog's does.
    const stripBottom = stripGeom.value.top + stripGeom.value.height;
    // Anything already sitting below the strip (e.g. Account's admin banner
    // pushing the header down) clamps to 0 and keeps its natural height.
    alignHeight.value = Math.max(0, stripBottom - top);
  }

  let ro: ResizeObserver | null = null;

  // Watching the target as well as the root: the page root is a fixed-height
  // flex column, so it doesn't resize when the header row's content wraps.
  function observe() {
    if (!ro) return;
    ro.disconnect();
    if (rootEl.value) ro.observe(rootEl.value);
    if (targetEl.value) ro.observe(targetEl.value);
  }

  onMounted(() => {
    nextTick(measure);
    ro = new ResizeObserver(() => measure());
    observe();
    // Web-font swap is a primary source of cross-platform drift — re-measure
    // once fonts are ready.
    document.fonts?.ready.then(measure).catch(() => {});
  });

  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
  });

  // Account swaps the aligned row between its logged-out and logged-in headers.
  watch(targetEl, () => {
    observe();
    nextTick(measure);
  });

  watch(stripGeom, () => nextTick(measure), { deep: true });

  return computed(() => ({
    "--strip-align-height": `${alignHeight.value}px`,
  }));
}
