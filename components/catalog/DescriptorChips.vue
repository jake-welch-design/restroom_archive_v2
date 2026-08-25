<script setup lang="ts">
/**
 * A restroom's descriptor tags, each a toggle for the catalog's tag filter.
 *
 * A chip reads as filled when its tag is part of the active filter, so the row
 * doubles as a display of the entry's tags and a control for narrowing the
 * catalog by them.
 *
 * Tag comparison is case-insensitive throughout. Tags are stored as the
 * submitter typed them, so "Dim" and "dim" are the same filter but not the same
 * string, and a case-sensitive check would show a chip as inactive while it was
 * filtering the list.
 */
withDefaults(
  defineProps<{
    tags: string[];
    activeTags: string[];
    /** `compact` is the grid tile, which has less room per chip. */
    density?: "comfortable" | "compact";
  }>(),
  { density: "comfortable" },
);

defineEmits<{ toggleTag: [tag: string] }>();

const { isTagActive } = useTagFilter();
</script>

<template>
  <div v-if="tags.length" class="descriptor-chips" :class="density" @click.stop>
    <button
      v-for="tag in tags"
      :key="tag"
      type="button"
      class="tag-chip"
      :class="{ active: isTagActive(tag, activeTags) }"
      @click.stop="$emit('toggleTag', tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<style scoped>
.descriptor-chips {
  --chip-size: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.descriptor-chips.compact {
  --chip-size: 11px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fff;
  color: #000;
  border: 1px solid #000;
  border-radius: 3px;
  padding: 3px 8px;
  font: inherit;
  font-size: var(--chip-size);
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.1s,
    color 0.1s;
}

.tag-chip:hover:not(.active) {
  background: #f0f0f0;
}

.tag-chip.active {
  background: #000;
  color: #fff;
}

.tag-chip.active:hover {
  background: #333;
}
</style>
