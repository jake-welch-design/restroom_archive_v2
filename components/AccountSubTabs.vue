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
    <button
      v-for="t in tabs"
      :key="t.id"
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
  </nav>
</template>

<style scoped>
.subtabs {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 19px;
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
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  color: #666;
  cursor: pointer;
}
.subtab-btn.gap-before {
  margin-left: 13px;
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
  padding: 1px 7px;
}
.subtab-btn:not(.active) .count {
  background: #666;
}
.subtab-btn.active .count {
  background: #fff;
  color: #000;
}

@media (max-width: 750px) {
  .subtab-btn {
    font-size: 12px;
    padding: 6px 10px;
  }
}
</style>
