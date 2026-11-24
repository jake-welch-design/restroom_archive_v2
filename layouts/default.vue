<script setup lang="ts">
const catalogRows = useCatalogRows();
const { selected, selectedSlug, select } = useSelection();
const randomPick = useRandomRestroom();
const panelOpen = ref(true);

// While the submission wizard has a scan loaded, it takes over this panel:
// shown in place of the normal catalog selection, forced open, toggle hidden.
const { previewModelUrl, previewEntry } = useSubmissionPreview();
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
 * viewer's control row cannot be measured: the row's 12px bottom offset, a tall
 * reading of the row itself, another 12px, and the 18px grabber. Deliberately
 * generous: erring low would put the grabber on top of the controls.
 */
const FALLBACK_CLEARANCE = 78;
/**
 * How far the sheet can push the viewer down; past this it overlays instead.
 * Pinned to the resting height so the default view is exactly the pre-drag
 * layout. The viewer only stops shrinking once the sheet is dragged past where
 * it normally sits.
 */
const PUSH_MAX = DEFAULT_FRAC;
/** Movement under this many px is a tap, not a drag. */
const TAP_SLOP = 5;

const panelFrac = ref(DEFAULT_FRAC);

function togglePanel() {
  // Closing keeps the current height so the sheet slides out by exactly its own
  // height. Opening always returns to the default, because a height reached by
  // dragging is for that session with the sheet, not a new resting place.
  if (!panelOpen.value) panelFrac.value = DEFAULT_FRAC;
  panelOpen.value = !panelOpen.value;
}

const dragFrac = ref<number | null>(null);
const dragging = ref(false);
const activeFrac = computed(() => dragFrac.value ?? panelFrac.value);

// Mid-drag the sheet is wherever the finger is, so "closed" follows the live
// height rather than the committed open/closed flag. Otherwise the viewer's
// closed-state chrome (title, gradient, bottom nav) would flicker.
const isClosed = computed(() => {
  if (inProgress.value) return false;
  // Exactly 0 (not a threshold): at 0 the `.closed` geometry and the dragged
  // geometry coincide, so the class can flip on without the sheet jumping.
  if (dragging.value) return (dragFrac.value ?? 0) === 0;
  return !panelOpen.value;
});

const sheetStyle = computed(() => ({
  "--panel-frac": String(activeFrac.value),
  // How far the viewer is pushed down. It tracks the sheet only up to
  // `PUSH_MAX`. Beyond that the sheet slides over the viewer rather than
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
 * Tallest the sheet may be, so that the grabber clears the viewer's controls
 * by the same margin they keep from the bottom of the screen. The controls are
 * a menu in the bottom-right corner: folded, only its button shows; open, a
 * column rises from it. `whole` measures the open column, otherwise just the
 * button. (The folded column keeps its full height in the layout, only hidden,
 * so the open column can be measured whatever state the menu is in.) Measured
 * off the live controls rather than hard-coded, so it follows their real
 * rendered size. They are anchored to the bottom of the viewport and the
 * viewer never moves once the sheet is past its resting height, so one read at
 * the start of a drag holds for all of it.
 */
function maxSheetFrac(tab: Element | null, whole: boolean) {
  const vh = window.innerHeight;
  const ctrl = document.querySelector(
    whole ? ".viewer-panel .overlay-right" : ".viewer-panel .ctrl-more",
  );
  const rect = ctrl?.getBoundingClientRect();
  const clearance =
    rect && rect.height > 0
      ? vh -
        rect.top +
        (vh - rect.bottom) +
        (tab?.getBoundingClientRect().height ?? 18)
      : FALLBACK_CLEARANCE;
  return Math.max(0, (vh - clearance) / vh);
}

// A drag only has to clear the menu button, because it folds the menu (see
// onTabPointerDown). Opening the menu again with the sheet that tall would
// raise the column under it, so the sheet makes way: it eases back down until
// the whole column clears it. The same goes for the column growing while open,
// when the crop tool's buttons arrive.
const { open: controlsOpen, columnHeight, cropping } = useViewerControls();
watch(
  [controlsOpen, columnHeight],
  () => {
    if (!controlsOpen.value || dragging.value || isClosed.value) return;
    if (!isSheetLayout()) return;
    const cap = maxSheetFrac(document.querySelector(".expand-tab"), true);
    if (panelFrac.value > cap) panelFrac.value = cap;
  },
  { flush: "post" },
);

// On mobile the crop tool takes the whole screen: the box needs every pixel of
// a phone's viewport, so opening it closes the sheet. Closing it brings the
// sheet back at its resting height, but only when it was the tool that closed
// it: a sheet the admin closed or reopened by hand meanwhile is left as it is.
// The viewer times the crop scene to land after this slide (see onCropButton).
let sheetClosedForCrop = false;
watch(cropping, (on) => {
  if (!isSheetLayout() || inProgress.value) return;
  if (on) {
    if (!panelOpen.value) return;
    panelOpen.value = false;
    sheetClosedForCrop = true;
  } else if (sheetClosedForCrop) {
    sheetClosedForCrop = false;
    if (!panelOpen.value) togglePanel();
  }
});
watch(panelOpen, (open) => {
  if (open) sheetClosedForCrop = false;
});

function clamp(n: number, max: number) {
  return Math.min(max, Math.max(0, n));
}

function onTabPointerDown(e: PointerEvent) {
  if (!isSheetLayout() || (e.pointerType === "mouse" && e.button !== 0)) return;
  dragPointerId = e.pointerId;
  // Fold the viewer's menu, so the sheet only has to clear its button.
  controlsOpen.value = false;
  dragMaxFrac = maxSheetFrac(e.currentTarget as HTMLElement, false);
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

  if (!dragMoved) return; // A tap, so let the click handler toggle.

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
        <NuxtLink to="/">The Restroom Archive</NuxtLink>
      </p>
      <Viewer
        :model-url="previewModelUrl ?? selected?.modelUrl ?? null"
        :slug="
          previewModelUrl
            ? (previewEntry?.slug ?? null)
            : (selected?.slug ?? null)
        "
        :restroom-id="
          previewModelUrl ? (previewEntry?.id ?? null) : (selected?.id ?? null)
        "
        :crop="
          previewModelUrl
            ? (previewEntry?.crop ?? null)
            : (selected?.crop ?? null)
        "
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

  /* Metrics for the viewer's overlay pills, declared here because `.nav-btn`
     below rebuilds its height from them to sit level with that row. The pills
     own the size: these are their values, not the nav row's. Custom properties
     cross into the viewer's scoped styles, which a class could not. */
  --ctrl-btn-size: 26px;
  --ctrl-group-pad-y: 4px;
  --ctrl-group-border: 1px;
}

.panel {
  flex: 0 0 auto;
  width: clamp(360px, 50%, 864px);
  height: 100%;
  background: var(--paper);
  overflow: hidden;
  transition: margin-left 0.35s ease;
  position: relative;
  z-index: 2;
  /* The panel's contents scale off the panel's own width rather than the
     viewport's. At a 1120px viewport this 50% panel is 560px, which is where
     `ListView`'s container queries already switch to the compact scale, so the
     chrome around the list has to switch on the same measurement. Named so the
     pages inside can query it past the nearer container on `.table-wrap`. */
  container: panel / inline-size;
}

.panel.closed {
  margin-left: calc(-1 * clamp(360px, 50%, 864px));
}

/* Divider between the panel and the viewer (`--panel-edge`, theme.css). A
   pseudo-element rather than a border or inset shadow: the page inside fills
   the panel with its own background and would paint over either. The tab's
   background covers it where the tab attaches, and the tab's own `::before`
   carries the line around its outside, so the edge reads as one outline with
   an opening for the tab rather than a rule cutting across it. */
.panel::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 1px;
  background: var(--panel-edge);
  pointer-events: none;
  z-index: 100;
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
  background: var(--paper);
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

/* The tab's half of the divider: top, right and bottom, starting 3px in so it
   joins the panel's line at the panel's last pixel (the tab overlaps the panel
   by 4px). Its own colour (`--tab-edge`), so the tab can stand out from the
   quieter edge line. The tab fits *between* the strip's top and bottom rules,
   so the outline reaches 1px past it each way to land on those rules and
   continue them. */
.expand-tab::before {
  content: "";
  position: absolute;
  top: -1px;
  right: 0;
  bottom: -1px;
  left: 3px;
  border: 1px solid var(--tab-edge);
  border-left: none;
  border-radius: inherit;
  pointer-events: none;
}

.caret {
  font-size: 16px;
  line-height: 1;
  color: var(--ink);
}
.caret.flip {
  display: inline-block;
  transform: rotate(180deg);
}

/* Sheet grabber. Mobile only; see the media query below. */
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
  text-decoration: none;
  color: inherit;
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
  /* Sized to the viewer's overlay pills rather than to its own text, so the
     bottom row reads as one set of controls. Rebuilt from the pills' three
     inputs instead of hardcoding their sum, so restyling them carries these
     along. Vertical padding is dropped: the flex centring above places the
     label, which keeps "Random" and the arrows centred at any height. */
  box-sizing: border-box;
  height: calc(
    var(--ctrl-btn-size, 26px) + 2 * var(--ctrl-group-pad-y, 4px) + 2 *
      var(--ctrl-group-border, 1px)
  );
  padding: 0 10px;
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
     squeezing it, so the default view is the plain un-dragged layout.
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
       default), and animating them together keeps the sheet's edge continuous. */
    transition:
      margin-top 0.35s ease,
      height 0.35s ease;
  }
  .panel.closed {
    margin-left: 0;
    margin-top: calc(-100dvh * var(--panel-frac, 0.55));
  }
  /* The sheet's divider runs along its bottom edge instead. */
  .panel::after {
    top: auto;
    left: 0;
    width: auto;
    height: 1px;
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
  /* Here the tab hangs below the sheet rather than overlapping it, so its
     outline reaches up 1px over the sheet's line, and `::after` paints out the
     stretch of that line between its two sides. */
  .expand-tab::before {
    top: -1px;
    bottom: 0;
    left: 0;
    border: 1px solid var(--tab-edge);
    border-top: none;
  }
  .expand-tab::after {
    content: "";
    position: absolute;
    top: -1px;
    left: 1px;
    right: 1px;
    height: 1px;
    background: var(--paper);
    pointer-events: none;
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
    background: var(--line-mid);
  }
  .expand-tab:active .grabber {
    background: var(--faint-hover);
  }

  .bottom-nav-info {
    max-width: calc(100vw - 80px);
  }
}
</style>
