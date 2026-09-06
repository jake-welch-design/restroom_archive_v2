<script setup lang="ts">
/**
 * The search-and-sort strip that sits above every admin list.
 *
 * The catalog's controls strip brought down to the account area's type scale:
 * an underlined search field and plain text controls with no boxes, so the row
 * reads as a set of labels rather than a toolbar competing with the sub-tabs
 * directly above it. 12px is the support step the sub-tabs use, which is what
 * keeps the two rows reading as one band.
 *
 * Lifted out of AdminAccounts, which is where this pattern started. It is a
 * component rather than markup each section repeats because there are now eight
 * of them, and a search field that sat 4px differently in one section would be
 * visible as a jump when switching between two.
 *
 * The `below` slot is for a read-out that belongs under the search field, such
 * as the accounts tally. Anything interactive belongs in the list, not here.
 */
export type SortOption<K extends string = string> = { key: K; label: string };

defineProps<{
  /** Sort menu contents. A single-option list still renders, as a read-out. */
  sortOptions: SortOption[];
  /** Placeholder and accessible name for the field, e.g. "Search accounts". */
  searchLabel: string;
  /**
   * Distinguishes this strip's `<select>` from every other one on the page,
   * so the label points at the right control.
   */
  idPrefix: string;
}>();

const query = defineModel<string>("query", { required: true });
const sortKey = defineModel<string>("sortKey", { required: true });
const sortDir = defineModel<"asc" | "desc">("sortDir", { required: true });
</script>

<template>
  <div class="list-controls">
    <div class="controls-left">
      <label class="search">
        <button
          v-if="query"
          type="button"
          class="search-icon clear"
          aria-label="Clear search"
          @click="query = ''"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="currentColor"
              stroke-width="1.25"
              fill="none"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <span v-else class="search-icon" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <circle
              cx="5"
              cy="5"
              r="3.25"
              stroke="currentColor"
              stroke-width="1.25"
              fill="none"
            />
            <path
              d="M7.5 7.5 L10.5 10.5"
              stroke="currentColor"
              stroke-width="1.25"
              stroke-linecap="round"
            />
          </svg>
        </span>

        <input
          v-model="query"
          type="search"
          :placeholder="searchLabel"
          :aria-label="searchLabel"
        />
      </label>

      <slot name="below" />
    </div>

    <div class="sort-control">
      <label class="sort-label" :for="`${idPrefix}-sort`">Sort by</label>
      <select :id="`${idPrefix}-sort`" v-model="sortKey" class="sort-select">
        <option v-for="opt in sortOptions" :key="opt.key" :value="opt.key">
          {{ opt.label }}
        </option>
      </select>
      <button
        type="button"
        class="sort-dir"
        :aria-label="
          sortDir === 'asc' ? 'Sorted ascending' : 'Sorted descending'
        "
        :title="sortDir === 'asc' ? 'Ascending' : 'Descending'"
        @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
      >
        <span class="sort-arrow" :class="{ desc: sortDir === 'desc' }">▲</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.list-controls {
  display: flex;
  /* Top-aligned rather than centred: a `below` read-out hangs under the search
     field, and centring would push the sort control down to straddle both lines
     instead of sitting on the search's own line. */
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 20px;
  padding-bottom: 12px;
}

.controls-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #000;
}

.search input {
  border: 0;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  width: 150px;
  background: transparent;
  outline: none;
}

.search-icon {
  display: inline-flex;
  align-items: center;
  color: #000;
}

.search-icon.clear {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.sort-label {
  color: #666;
}

/* Stripped of the native chrome for the same reason the buttons are: this strip
   is text, and a platform select box would be the only raised object on the
   page. The menu it drops is still the native one. */
.sort-select {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #000;
  border-radius: 0;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  color: #000;
  cursor: pointer;
}

.sort-dir {
  display: inline-flex;
  align-items: center;
  background: none;
  border: 0;
  padding: 2px;
  font: inherit;
  color: #000;
  cursor: pointer;
}

/* One caret that turns over, as in the catalog's grid sort: the direction is
   the same fact either way, so it is one control rather than two arrows of
   which one is always inert. */
.sort-arrow {
  display: inline-block;
  font-size: 9px;
  line-height: 1;
  transition: transform 0.15s;
}

.sort-arrow.desc {
  transform: rotate(180deg);
}

@media (hover: hover) {
  .search-icon.clear:hover,
  .sort-dir:hover,
  .sort-select:hover {
    color: #555;
  }
}
</style>
