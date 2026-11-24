<script setup lang="ts">
// Navigation levels two and three on the account page. `gapBefore` opens a
// wider space before an item so a long row still reads as grouped.
//
// Two looks, because the Admin tab stacks two of these: a group row and the
// sections inside the chosen group. Rendering both as the same segmented block
// would leave nothing but position to say which one contains the other.
//
// - `segmented` (the default) is the bordered block that sits under the
//   underlined main tabs.
// - `plain` is the third level: text with an underline on the active item,
//   which is the main tabs' own idiom one step quieter. It reads as subordinate
//   to the segmented row above it rather than as a rival to it.
export type SubTab = {
  id: string;
  label: string;
  count?: number | null;
  gapBefore?: boolean;
};

withDefaults(
  defineProps<{
    tabs: SubTab[];
    modelValue: string;
    variant?: "segmented" | "plain";
  }>(),
  { variant: "segmented" },
);

defineEmits<{ (e: "update:modelValue", id: string): void }>();
</script>

<template>
  <nav class="subtabs" :class="`is-${variant}`" role="tablist">
    <template v-for="t in tabs" :key="t.id">
      <!-- Full-width zero-height flex item: the standard way to force a wrap at
           a chosen point. Only on narrow screens, where it turns `gapBefore`
           into a real line break instead of a gap the wrap can land inside. -->
      <span v-if="t.gapBefore" class="row-break" aria-hidden="true" />
      <button
        type="button"
        class="subtab-btn"
        :class="{ active: modelValue === t.id, 'gap-before': t.gapBefore }"
        role="tab"
        :aria-selected="modelValue === t.id"
        @click="$emit('update:modelValue', t.id)"
      >
        {{ t.label }}
        <span v-if="t.count" class="count">{{ t.count }}</span>
      </button>
    </template>
    <!-- Trailing controls that are not tabs, such as a help button. Given the
         `subtab-btn` class they take the same look, set a gap apart. -->
    <slot />
  </nav>
</template>

<style scoped>
/* Support step of the account type scale (12px), one notch under the 15px
   main tabs it sits beneath. See the scale comment in pages/account.vue. */
.subtabs {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 15px;
}
.subtab-btn,
:slotted(.subtab-btn) {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  background: transparent;
  border: 1px solid var(--ink);
  /* Every button carries its own border and overlaps its neighbour, so
     adjacent buttons share one hairline and the control still reads as a
     segmented block once the row wraps in a narrow panel. */
  margin: 0 -1px -1px 0;
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.subtab-btn.gap-before {
  margin-left: 11px;
}
/* A slotted control is not part of the segmented block, so it always stands
   apart, including on a phone where `gap-before` gives way to a line break. */
:slotted(.subtab-btn) {
  margin: 0 0 -1px 11px;
  /* A slotted control can be a link, such as the Admin tab's way out to the
     video studio. */
  text-decoration: none;
}
/* A second trailing control that belongs with the one before it, such as the
   Admin tab's studio and newsletter links: joined on a shared hairline like
   the tabs, rather than set a gap apart. */
:slotted(.subtab-btn.joined) {
  margin-left: -1px;
}
.row-break {
  display: none;
}
.subtab-btn:hover:not(.active),
:slotted(.subtab-btn:hover) {
  background: var(--canvas);
  color: var(--ink);
}
.subtab-btn.active {
  background: var(--ink);
  color: var(--paper);
}
.count {
  font-size: 11px;
  background: var(--ink);
  color: var(--paper);
  border-radius: 6px;
  padding: 1px 6px;
}
.subtab-btn:not(.active) .count {
  background: var(--muted);
}
.subtab-btn.active .count {
  background: var(--paper);
  color: var(--ink);
}

/* --- The plain variant ----------------------------------------------------- */
/* Third level: no borders, no fill, an underline on the active item. Sits
   directly under the segmented row it belongs to — the tighter top margin is
   what makes the pair read as one nested control rather than two rows of
   equals. */
.subtabs.is-plain {
  gap: 2px;
  margin-top: -8px;
  margin-bottom: 14px;
}

.is-plain .subtab-btn {
  border: 0;
  margin: 0;
  padding: 4px 10px 3px;
  border-bottom: 1px solid transparent;
}

.is-plain .subtab-btn:hover:not(.active) {
  background: transparent;
  color: var(--ink);
}

.is-plain .subtab-btn.active {
  background: transparent;
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.is-plain .subtab-btn.active .count {
  background: var(--ink);
  color: var(--paper);
}

/* The first item lines up with the list below rather than sitting a pad-width
   in, since there is no longer a border to hold the row's left edge. */
.is-plain .subtab-btn:first-of-type {
  padding-left: 0;
}

/* Same panel-width step as the account page these sit in. */
@container panel (max-width: 560px) {
  .subtab-btn,
  :slotted(.subtab-btn) {
    padding: 5px 10px;
  }
  .is-plain .subtab-btn {
    padding: 4px 8px 3px;
  }
  .is-plain .subtab-btn:first-of-type {
    padding-left: 0;
  }
}

/* On a phone the row is too long to sit on one line, and left to itself it
   wraps mid-group — the admin tabs get split across both lines with the
   `gap-before` indent stranded in the middle of the second. Break at the group
   boundary instead, so the queues make up one row and the admin tabs the next,
   both flush left with a clear 11px between them. Same window breakpoint as the
   account page's sheet layout. */
@media (max-width: 750px) {
  .row-break {
    display: block;
    flex-basis: 100%;
    /* The rows' whole separation: the buttons' border-overlap margin is off
       below, so this is the gap you see. */
    height: 11px;
  }
  .subtab-btn {
    /* Only the horizontal overlap is wanted now. Pulling rows together by 1px
       would fight the gap the break element just opened. */
    margin-bottom: 0;
  }
  /* Level with the buttons above, whose bottom overlap is off here too. */
  :slotted(.subtab-btn) {
    margin-bottom: 0;
  }
  .subtab-btn.gap-before {
    /* The break already separates the groups; an indent here would push the
       second row off the left edge. */
    margin-left: 0;
  }
}

/* The smallest phones, where the Admin tab's four groups and the studio icon
   only share a line with the padding taken in. */
@media (max-width: 374px) {
  .subtab-btn,
  :slotted(.subtab-btn) {
    padding: 5px 6px;
  }
  :slotted(.subtab-btn) {
    margin-left: 4px;
  }
}
</style>
