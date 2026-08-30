<script setup lang="ts">
// Segmented control used as the second (and last) navigation level on the
// account page. Sits under the underlined main tabs; `gapBefore` opens a wider
// space before an item so a long row still reads as grouped.
export type SubTab = {
  id: string;
  label: string;
  count?: number | null;
  gapBefore?: boolean;
};

defineProps<{ tabs: SubTab[]; modelValue: string }>();
defineEmits<{ (e: "update:modelValue", id: string): void }>();
</script>

<template>
  <nav class="subtabs" role="tablist">
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
.subtab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  background: transparent;
  border: 1px solid #000;
  /* Every button carries its own border and overlaps its neighbour, so
     adjacent buttons share one hairline and the control still reads as a
     segmented block once the row wraps in a narrow panel. */
  margin: 0 -1px -1px 0;
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}
.subtab-btn.gap-before {
  margin-left: 11px;
}
.row-break {
  display: none;
}
.subtab-btn:hover:not(.active) {
  background: #f4f4f4;
  color: #000;
}
.subtab-btn.active {
  background: #000;
  color: #fff;
}
.count {
  font-size: 11px;
  background: #000;
  color: #fff;
  border-radius: 6px;
  padding: 1px 6px;
}
.subtab-btn:not(.active) .count {
  background: #666;
}
.subtab-btn.active .count {
  background: #fff;
  color: #000;
}

/* Same panel-width step as the account page these sit in. */
@container panel (max-width: 560px) {
  .subtab-btn {
    padding: 5px 10px;
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
  .subtab-btn.gap-before {
    /* The break already separates the groups; an indent here would push the
       second row off the left edge. */
    margin-left: 0;
  }
}
</style>
