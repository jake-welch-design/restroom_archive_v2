<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), {
  ariaLabel: "More info",
});

/* The bubble is teleported to <body> and positioned with fixed coordinates so
   it can't be clipped by the scrolling/overflow-hidden panels it lives in
   (e.g. the account panel's .body-section). Position is measured from the
   button and kept inside the viewport: tall bubbles that fit neither above nor
   below the button flip out to the side rather than running off screen. */
const MARGIN = 8;
const GAP = 6;

const open = ref(false);
const btn = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
const pos = ref({ top: 0, left: 0 });

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function place() {
  const b = btn.value;
  const el = bubble.value;
  if (!b || !el) return;

  const anchor = b.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Room for the bubble on each side of the button, margins already deducted.
  const above = anchor.top - GAP - MARGIN;
  const below = vh - anchor.bottom - GAP - MARGIN;
  const right = vw - anchor.right - GAP - MARGIN;
  const left = anchor.left - GAP - MARGIN;

  // Centred on the button along the free axis, then clamped to the viewport.
  const centredLeft = () =>
    clamp(
      anchor.left + anchor.width / 2 - box.width / 2,
      MARGIN,
      vw - box.width - MARGIN,
    );
  const centredTop = () =>
    clamp(
      anchor.top + anchor.height / 2 - box.height / 2,
      MARGIN,
      vh - box.height - MARGIN,
    );

  if (box.height <= above) {
    // Preferred: above the button.
    pos.value = { top: anchor.top - box.height - GAP, left: centredLeft() };
  } else if (box.height <= below) {
    pos.value = { top: anchor.bottom + GAP, left: centredLeft() };
  } else if (box.width <= right) {
    // Too tall for either gap — go out to the side, right first.
    pos.value = { top: centredTop(), left: anchor.right + GAP };
  } else if (box.width <= left) {
    pos.value = { top: centredTop(), left: anchor.left - box.width - GAP };
  } else {
    // Nothing fits cleanly (very small viewport): use the roomier vertical
    // side and clamp, so the bubble stays on screen even if it overlaps.
    const top =
      above >= below
        ? clamp(anchor.top - box.height - GAP, MARGIN, vh - box.height - MARGIN)
        : clamp(anchor.bottom + GAP, MARGIN, vh - box.height - MARGIN);
    pos.value = { top, left: centredLeft() };
  }
}

async function show() {
  open.value = true;
  await nextTick();
  place();
}
function hide() {
  open.value = false;
}
function toggle() {
  if (open.value) hide();
  else show();
}

// Keep the bubble glued to its button while anything scrolls or the window
// resizes. Capture phase so scrolls inside nested containers are seen too.
watch(open, (isOpen) => {
  if (typeof window === "undefined") return;
  if (isOpen) {
    window.addEventListener("scroll", place, { passive: true, capture: true });
    window.addEventListener("resize", place, { passive: true });
  } else {
    window.removeEventListener("scroll", place, { capture: true } as never);
    window.removeEventListener("resize", place);
  }
});

onBeforeUnmount(() => {
  if (typeof window === "undefined") return;
  window.removeEventListener("scroll", place, { capture: true } as never);
  window.removeEventListener("resize", place);
});
</script>

<template>
  <span class="info-tooltip" @mouseenter="show" @mouseleave="hide">
    <button
      ref="btn"
      type="button"
      class="info-btn"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      @focus="show"
      @blur="hide"
      @click="toggle"
    >
      i
    </button>
    <Teleport to="body">
      <span
        v-if="open"
        ref="bubble"
        class="info-bubble"
        role="tooltip"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      >
        <slot />
      </span>
    </Teleport>
  </span>
</template>

<style scoped>
.info-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.info-btn {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1px solid #666;
  background: transparent;
  color: #666;
  font: inherit;
  font-size: 10px;
  font-style: italic;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.info-btn:hover,
.info-btn:focus-visible {
  border-color: #000;
  color: #000;
}
</style>

<style>
/* Unscoped: the bubble is teleported out of this component's DOM subtree. */
.info-bubble {
  position: fixed;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 4px;
  width: max-content;
  max-width: min(260px, calc(100vw - 16px));
  /* Never taller than the window, so placement can always keep it on screen. */
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  z-index: 3000;
  text-align: left;
  pointer-events: none;
}
.info-bubble ul {
  margin: 4px 0 0;
  padding-left: 16px;
}
.info-bubble p {
  margin: 0;
}
.info-bubble p + p {
  margin-top: 6px;
}

@media (max-width: 750px) {
  .info-bubble {
    max-width: min(200px, calc(100vw - 16px));
  }
}
</style>
