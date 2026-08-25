<script setup lang="ts">
const catalogRows = useCatalogRows();
const { selected, selectedSlug, select } = useSelection();
const randomPick = useRandomRestroom();
const panelOpen = ref(true);

// While the submission wizard has a scan loaded, it takes over this panel:
// shown in place of the normal catalog selection, forced open, toggle hidden.
const { previewModelUrl } = useSubmissionPreview();
const inProgress = computed(() => !!previewModelUrl.value);

// Measured by Catalog.vue so the tab lines up with the header strip exactly,
// instead of relying on pixel constants that drift across platforms/fonts.
const stripGeom = useStripGeom();
const tabStyle = computed(() => ({
  "--tab-top": `${stripGeom.value.top}px`,
  "--tab-height": `${stripGeom.value.height}px`,
}));

// --- Mobile drag-to-resize ------------------------------------------------
// Below 750px the panel is a top-anchored sheet whose height is a fraction of
// the viewport, and `.expand-tab` is its grabber. Tapping the grabber still just
// toggles; dragging it resizes the sheet anywhere between closed and as tall as
// it can get without the grabber colliding with the viewer's bottom controls
// (see `maxSheetFrac`). The fractions are published as CSS vars so everything
// that keys off the sheet (height, closed offset, tab, viewer) stays in sync.
const DEFAULT_FRAC = 0.55;
/** Released below this → treat as a close gesture. */
const CLOSE_FRAC = 0.15;
/** Released within this of the tallest allowed height → snap to it. */
const FULL_SNAP = 0.08;
/**
 * Clearance (px) the grabber keeps from the bottom of the screen when the
 * viewer's control row can't be measured — the row's 12px bottom offset, a tall
 * reading of the row itself, another 12px, and the 18px grabber. Deliberately
 * generous: erring low would put the grabber on top of the controls.
 */
const FALLBACK_CLEARANCE = 78;
/**
 * How far the sheet can push the viewer down; past this it overlays instead.
 * Pinned to the resting height so the default view is exactly the pre-drag
 * layout — the viewer only stops shrinking once the sheet is dragged past where
 * it normally sits.
 */
const PUSH_MAX = DEFAULT_FRAC;
/** Movement under this many px is a tap, not a drag. */
const TAP_SLOP = 5;

/** Rendered sheet height. */
const panelFrac = ref(DEFAULT_FRAC);

function togglePanel() {
  // Closing keeps the current height so the sheet slides out by exactly its own
  // height. Opening always returns to the default — a height reached by dragging
  // is for that session with the sheet, not a new resting place.
  if (!panelOpen.value) panelFrac.value = DEFAULT_FRAC;
  panelOpen.value = !panelOpen.value;
}

const dragFrac = ref<number | null>(null);
const dragging = ref(false);
const activeFrac = computed(() => dragFrac.value ?? panelFrac.value);

// Mid-drag the sheet is wherever the finger is, so "closed" follows the live
// height rather than the committed open/closed flag — otherwise the viewer's
// closed-state chrome (title, gradient, bottom nav) would flicker.
const isClosed = computed(() => {
  if (inProgress.value) return false;
  // Exactly 0 (not a threshold): at 0 the `.closed` geometry and the dragged
  // geometry coincide, so the class can flip on without the sheet jumping.
  if (dragging.value) return (dragFrac.value ?? 0) === 0;
  return !panelOpen.value;
});

const sheetStyle = computed(() => ({
  // Sheet height.
  "--panel-frac": String(activeFrac.value),
  // How far the viewer is pushed down. It tracks the sheet only up to
  // `PUSH_MAX` — beyond that the sheet slides over the viewer rather than
  // squeezing it, so the model keeps the space it has at rest no matter how
  // tall the sheet gets (and stops being re-laid-out on every drag frame).
  "--push-frac": String(
    isClosed.value ? 0 : Math.min(activeFrac.value, PUSH_MAX),
  ),
}));

let dragPointerId: number | null = null;
let dragStartY = 0;
let dragStartFrac = 0;
let dragMaxFrac = 1;
let dragMoved = false;
let suppressClick = false;
let suppressTimer: ReturnType<typeof setTimeout> | null = null;

function isSheetLayout() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 750px)").matches
  );
}

/**
 * Tallest the sheet may be dragged: the grabber has to clear the viewer's
 * bottom control row (the annotation toggle) by the same margin that row keeps
 * from the bottom of the screen. Measured off the live controls rather than
 * hard-coded, so it follows their real rendered size. The row is anchored to the
 * bottom of the viewport and the viewer never moves once the sheet is past its
 * resting height, so one read at the start of the drag holds for all of it.
 */
function maxSheetFrac(tab: HTMLElement) {
  const vh = window.innerHeight;
  const ctrl =
    document.querySelector(".viewer-panel .annotation-group") ??
    document.querySelector(".viewer-panel .overlay-right");
  const rect = ctrl?.getBoundingClientRect();
  const clearance =
    rect && rect.height > 0
      ? vh - rect.top + (vh - rect.bottom) + tab.getBoundingClientRect().height
      : FALLBACK_CLEARANCE;
  return Math.max(0, (vh - clearance) / vh);
}

function clamp(n: number, max: number) {
  return Math.min(max, Math.max(0, n));
}

function onTabPointerDown(e: PointerEvent) {
  if (!isSheetLayout() || (e.pointerType === "mouse" && e.button !== 0)) return;
  dragPointerId = e.pointerId;
  dragMaxFrac = maxSheetFrac(e.currentTarget as HTMLElement);
  dragStartY = e.clientY;
  // Dragging out of the closed state starts from zero height, not from the
  // remembered open height.
  dragStartFrac = panelOpen.value ? panelFrac.value : 0;
  dragMoved = false;
  dragFrac.value = dragStartFrac;
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onTabPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== dragPointerId) return;
  const dy = e.clientY - dragStartY;
  if (!dragMoved) {
    if (Math.abs(dy) < TAP_SLOP) return;
    dragMoved = true;
  }
  // `innerHeight` is what `100dvh` resolves to, so px and fraction agree.
  dragFrac.value = clamp(dragStartFrac + dy / window.innerHeight, dragMaxFrac);
}

function endDrag(e: PointerEvent, commit: boolean) {
  if (!dragging.value || e.pointerId !== dragPointerId) return;
  const frac = dragFrac.value ?? dragStartFrac;
  dragging.value = false;
  dragFrac.value = null;
  dragPointerId = null;

  if (!dragMoved) return; // a tap — let the click handler toggle

  // The drag consumed the gesture; swallow the click browsers synthesise after
  // it, with a timer in case this one never fires.
  suppressClick = true;
  if (suppressTimer) clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => {
    suppressClick = false;
  }, 400);

  if (!commit) return;
  if (frac <= CLOSE_FRAC) {
    // Render at the height the finger left so the close slides out from there
    // rather than jumping; reopening resets to the default either way.
    panelFrac.value = frac;
    panelOpen.value = false;
  } else {
    panelFrac.value = frac >= dragMaxFrac - FULL_SNAP ? dragMaxFrac : frac;
    panelOpen.value = true;
  }
}

function onTabPointerUp(e: PointerEvent) {
  endDrag(e, true);
}

function onTabPointerCancel(e: PointerEvent) {
  endDrag(e, false);
}

function onTabClick() {
  if (suppressClick) {
    suppressClick = false;
    if (suppressTimer) clearTimeout(suppressTimer);
    return;
  }
  togglePanel();
}

onBeforeUnmount(() => {
  if (suppressTimer) clearTimeout(suppressTimer);
});

const currentIndex = computed(() => {
  const slug = selectedSlug.value;
  return catalogRows.value.findIndex((r) => r.slug === slug);
});

function goNext() {
  const list = catalogRows.value;
  if (!list.length || currentIndex.value < 0) return;
  select(list[(currentIndex.value + 1) % list.length].slug);
}

function goPrev() {
  const list = catalogRows.value;
  if (!list.length || currentIndex.value < 0) return;
  select(list[(currentIndex.value - 1 + list.length) % list.length].slug);
}
</script>

<template>
  <div class="shell" :class="{ dragging }" :style="sheetStyle">
    <a href="#main" class="skip-link">Skip to main content</a>

    <aside class="panel" :class="{ closed: isClosed }">
      <slot />
    </aside>

    <button
      v-if="!inProgress"
      type="button"
      class="expand-tab"
      :class="{ closed: isClosed }"
      :style="tabStyle"
      :aria-label="panelOpen ? 'Hide catalog' : 'Show catalog'"
      @click="onTabClick"
      @pointerdown="onTabPointerDown"
      @pointermove="onTabPointerMove"
      @pointerup="onTabPointerUp"
      @pointercancel="onTabPointerCancel"
    >
      <span class="caret" :class="{ flip: !panelOpen }">‹</span>
      <span class="grabber" aria-hidden="true" />
    </button>

    <main id="main" class="viewer-panel">
      <p v-show="isClosed" class="corner-title">
        <a href="/" style="text-decoration: none; color: inherit"
          >The Restroom Archive</a
        >
      </p>
      <Viewer
        :model-url="previewModelUrl ?? selected?.modelUrl ?? null"
        :slug="previewModelUrl ? null : (selected?.slug ?? null)"
        :thumb-url="previewModelUrl ? null : (selected?.thumbUrl ?? null)"
      />

      <Transition name="fade">
        <div v-if="isClosed" class="bottom-gradient" />
      </Transition>

      <Transition name="fade">
        <div v-if="isClosed && selected" class="bottom-nav">
          <p class="bottom-nav-info">
            <span>{{ selected.name }}</span>
            <span>{{ selected.date }}</span>
            <span>{{ selected.location }}</span>
          </p>
          <div class="bottom-nav-controls">
            <button class="nav-btn" title="Previous" @click="goPrev">←</button>
            <button class="nav-btn" title="Random" @click="randomPick">
              Random
            </button>
            <button class="nav-btn" title="Next" @click="goNext">→</button>
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.shell {
  position: fixed;
  inset: 0;
  display: flex;
  background: #000;
  overflow: hidden;
}

.panel {
  flex: 0 0 auto;
  width: clamp(360px, 50%, 864px);
  height: 100%;
  background: #fff;
  overflow: hidden;
  transition: margin-left 0.35s ease;
  position: relative;
  z-index: 2;
  /* The panel's contents scale off the panel's own width rather than the
     viewport's — at a 1120px viewport this 50% panel is 560px, which is where
     `ListView`'s container queries already switch to the compact scale, so the
     chrome around the list has to switch on the same measurement. Named so the
     pages inside can query it past the nearer container on `.table-wrap`. */
  container: panel / inline-size;
}

.panel.closed {
  margin-left: calc(-1 * clamp(360px, 50%, 864px));
}

.expand-tab {
  position: absolute;
  left: calc(clamp(360px, 50%, 864px) - 4px);
  /* Borderless tab that pokes past the panel edge: sit just under the controls'
     top border and end just above the sub-header's bottom border (hence -1px).
     Both borders belong to the panel and stop at its right edge. */
  top: var(--tab-top, 61.5px);
  width: 22px;
  height: calc(var(--tab-height, 69px) - 1px);
  background: #fff;
  border: none;
  border-radius: 0 8px 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 0 0 4px;
  z-index: 11;
  touch-action: manipulation;
  transition: left 0.35s ease;
}

.expand-tab.closed {
  left: -4px;
}

.caret {
  font-size: 16px;
  line-height: 1;
  color: #000;
}
.caret.flip {
  display: inline-block;
  transform: rotate(180deg);
}

/* Sheet grabber — mobile only (see the media query below). */
.grabber {
  display: none;
}

.viewer-panel {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  position: relative;
  /* Its own stacking context, below `.panel`'s 2. Without it the viewer's
     internal overlays (the loading GIF sits at z-index 10) are stacked against
     the panel directly and paint over the sheet where the two overlap. */
  z-index: 1;
}
.corner-title {
  position: absolute;
  top: 0;
  left: 16px;
  margin: 0;
  padding: 16px 0;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 24px;
  font-weight: 400;
  color: #fff;
  text-shadow: 0px 0px 5px rgba(0, 0, 0, 0.2);
  pointer-events: none;
  z-index: 1;
}
.corner-title a {
  pointer-events: auto;
}

.bottom-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 150px;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.2) 100%
  );
  pointer-events: none;
  z-index: 2;
}

.bottom-nav {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 3;
  pointer-events: auto;
}
.bottom-nav-info {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  color: #fff;
  text-align: center;
  mix-blend-mode: difference;
}
.bottom-nav-info span {
  display: block;
}
.bottom-nav-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  padding: 4px 10px;
  transition: opacity 0.12s;
}
.nav-btn:hover {
  opacity: 0.8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 750px) {
  .shell {
    flex-direction: column;
  }
  /* `--panel-frac` is the sheet height as a fraction of the viewport and
     `--push-frac` is how far the viewer is pushed down by it; both are published
     by the layout script. The sheet starts at 0.55 and the grabber can take it
     from 0 (closed) up to its measured cap, but `--push-frac` stops at the
     resting 0.55, so past that the sheet slides over the viewer instead of
     squeezing it — the default view is the plain un-dragged layout.
     Both are out of flow: in flow the sheet would push the viewer off-screen. */
  .panel {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: auto;
    height: calc(100dvh * var(--panel-frac, 0.55));
    /* Height is animated as well as the offset because reopening can change
       both at once (dragged to some height, tapped shut, reopens at the
       default) — animating them together keeps the sheet's edge continuous. */
    transition:
      margin-top 0.35s ease,
      height 0.35s ease;
  }
  .panel.closed {
    margin-left: 0;
    margin-top: calc(-100dvh * var(--panel-frac, 0.55));
  }
  /* While the finger is down everything must track it exactly, not ease. */
  .shell.dragging .panel,
  .shell.dragging .viewer-panel,
  .shell.dragging .expand-tab {
    transition: none;
  }

  .corner-title {
    padding: 8px 0;
    left: 8px;
  }

  .viewer-panel {
    display: block;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: calc(100dvh * var(--push-frac, 0.55));
    height: auto;
    min-height: 0;
    transition: top 0.35s ease;
  }
  .expand-tab {
    --sheet-tab-h: 18px;
    display: flex;
    position: fixed;
    left: auto;
    right: 16px;
    /* Rides the sheet's bottom edge. `maxSheetFrac` already stops the drag well
       above the bottom of the screen; the `min()` is a backstop for any height
       that arrives from elsewhere. */
    top: min(
      calc(100dvh * var(--panel-frac, 0.55)),
      calc(100dvh - var(--sheet-tab-h) - env(safe-area-inset-bottom, 0px))
    );
    width: 77.5px;
    height: var(--sheet-tab-h);
    border-radius: 0 0 8px 8px;
    padding: 0;
    /* Vertical drags are ours, not the browser's. */
    touch-action: none;
    transition: top 0.35s ease;
  }
  .expand-tab.closed {
    top: 0;
    left: auto;
  }
  /* `.flip` also sets `display`, so it has to be named here to stay hidden. */
  .caret,
  .caret.flip {
    display: none;
  }
  .grabber {
    display: block;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: #c4c4c4;
  }
  .expand-tab:active .grabber {
    background: #9a9a9a;
  }
  .bottom-nav {
    bottom: 0.75rem;
  }

  .bottom-nav-info {
    max-width: calc(100vw - 80px);
  }
}
</style>
