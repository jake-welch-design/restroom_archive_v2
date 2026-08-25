<script setup lang="ts">
import Fuse from "fuse.js";
import type { RestroomSummary } from "~/types/restroom";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";

type SortKey = "isoDate" | "name" | "location";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grid" | "map";

const { data, pending, error } = useRestrooms();
const { selectedSlug, selected, select } = useSelection();
const catalogRows = useCatalogRows();

const sortKey = ref<SortKey>("isoDate");
const sortDir = ref<SortDir>("desc");
const query = ref("");
const viewMode = useCookie<ViewMode>("viewMode", { default: () => "list" });
const dateFrom = ref<string>("");
const dateTo = ref<string>("");
const activeTags = ref<string[]>([]);
const filterOpen = ref(false);

const allTags = computed(() => {
  const seen = new Set<string>();
  for (const r of data.value ?? []) {
    for (const t of r.descriptors ?? []) {
      seen.add(t);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
});

function isTagActive(tag: string) {
  const lower = tag.toLowerCase();
  return activeTags.value.some((t) => t.toLowerCase() === lower);
}

function toggleTag(tag: string) {
  const t = tag.trim();
  if (!t) return;
  const lower = t.toLowerCase();
  const idx = activeTags.value.findIndex((x) => x.toLowerCase() === lower);
  if (idx >= 0) {
    activeTags.value.splice(idx, 1);
  } else {
    activeTags.value.push(t);
    filterOpen.value = true;
  }
}

function removeTag(tag: string) {
  const lower = tag.toLowerCase();
  activeTags.value = activeTags.value.filter((x) => x.toLowerCase() !== lower);
}

const fuse = computed(() => {
  const list = data.value ?? [];
  return new Fuse(list, {
    keys: ["name", "location", "date", "isoDate"],
    threshold: 0.3,
  });
});

const rows = computed<RestroomSummary[]>(() => {
  // Admins get pending entries in `data` so /r/<slug> can resolve them, but
  // they shouldn't clutter the visible directory.
  const list = (data.value ?? []).filter((r) => r.status !== "pending");
  const q = query.value.trim();
  const base = q
    ? fuse.value.search(q).map((r) => r.item)
    : [...list].sort((a, b) => {
        const key = sortKey.value;
        const dir = sortDir.value === "asc" ? 1 : -1;
        const av = a[key] ?? "";
        const bv = b[key] ?? "";
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
  if (!activeTags.value.length) return base;
  const needles = activeTags.value.map((t) => t.toLowerCase());
  return base.filter((r) => {
    const have = (r.descriptors ?? []).map((t) => t.toLowerCase());
    return needles.every((n) => have.includes(n));
  });
});

watchEffect(() => {
  catalogRows.value = rows.value;
});

const mapRows = computed<RestroomSummary[]>(() => {
  const base = rows.value;
  if (!dateFrom.value && !dateTo.value) return base;
  return base.filter((r) => {
    if (!r.isoDate) return false;
    if (dateFrom.value && r.isoDate < dateFrom.value) return false;
    if (dateTo.value && r.isoDate > dateTo.value) return false;
    return true;
  });
});

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "isoDate" ? "desc" : "asc";
  }
}

const mapPanelVisible = ref(false);

function handleMapSelect(slug: string) {
  select(slug);
  mapPanelVisible.value = true;
}

watch(viewMode, (mode) => {
  if (mode !== "map") mapPanelVisible.value = false;
  else if (selectedSlug.value) mapPanelVisible.value = true;
});

watch(selectedSlug, (slug) => {
  if (viewMode.value === "map" && slug) mapPanelVisible.value = true;
});

const randomPick = useRandomRestroom();

const route = useRoute();
const hasAutoSelected = useState("hasAutoSelected", () => false);

function maybeAutoSelect() {
  if (hasAutoSelected.value || route.params.slug) return;
  if (!data.value?.length) return;
  randomPick();
  hasAutoSelected.value = true;
}

onMounted(maybeAutoSelect);
watch(data, maybeAutoSelect);

// --- Header-strip geometry ----------------------------------------------
// The layout's `.expand-tab` must line up with the header strip (`.controls`
// through the sub-header / list `.thead`). Rather than matching hand-tuned
// pixel constants — which drift across platforms because of font metrics and
// native control sizing — we measure the real rendered strip and publish it so
// the tab derives its top/height from the same source of truth.
const stripGeom = useStripGeom();
const catalogEl = ref<HTMLElement | null>(null);
const controlsEl = ref<HTMLElement | null>(null);

function measureStrip() {
  const cat = catalogEl.value;
  const controls = controlsEl.value;
  if (!cat || !controls) return;
  const catTop = cat.getBoundingClientRect().top;
  const cRect = controls.getBoundingClientRect();
  // First strip element in document order: Catalog's own `.sub-header`
  // (grid/map) or the ListView's `.thead` (list). Falls back to `.controls`.
  const bottomEl = cat.querySelector<HTMLElement>(".sub-header, .thead");
  const top = cRect.top - catTop;
  // Sum the two strip rows rather than spanning from one's top to the other's
  // bottom: the filter panel opens *between* them, and a span would swallow it
  // and stretch the tab. They're adjacent rows of the same flex column, so with
  // the filter closed the sum is the span — it just stops the tab resizing when
  // the filter opens under it.
  const height =
    cRect.height + (bottomEl ? bottomEl.getBoundingClientRect().height : 0);
  if (height > 0) stripGeom.value = { top, height };
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  nextTick(measureStrip);
  ro = new ResizeObserver(() => measureStrip());
  if (catalogEl.value) ro.observe(catalogEl.value);
  if (controlsEl.value) ro.observe(controlsEl.value);
  // Web-font swap is a primary source of cross-platform drift — re-measure once
  // fonts are ready.
  document.fonts?.ready.then(measureStrip).catch(() => {});
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
});

// The strip's bottom element swaps between views (thead ↔ sub-header), the
// filter panel inserts a row, and in list view the `.thead` only mounts once
// rows exist — re-measure after the DOM settles for any of these.
watch([viewMode, filterOpen, pending, () => rows.value.length], () =>
  nextTick(measureStrip),
);
</script>

<template>
  <div ref="catalogEl" class="catalog">
    <CatalogHeader />

    <div ref="controlsEl" class="controls">
      <div class="controls-left">
        <label class="search">
          <button
            v-if="query"
            type="button"
            class="search-icon clear"
            aria-label="Clear search"
            @click="query = ''"
          >
            <svg viewBox="0 0 12 12" width="12" height="12">
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

          <input v-model="query" type="search" placeholder="Search" />
        </label>

        <button type="button" class="link-btn" @click="randomPick">
          Random
        </button>

        <button
          type="button"
          class="link-btn filter-btn"
          :class="{ active: filterOpen }"
          :aria-expanded="filterOpen"
          @click="filterOpen = !filterOpen"
        >
          Filter
          <span class="filter-caret" :class="{ open: filterOpen }">›</span>
        </button>
      </div>

      <div class="view-mode">
        <button
          class="link-btn"
          :class="{ active: viewMode === 'list' }"
          :aria-pressed="viewMode === 'list'"
          @click="viewMode = 'list'"
        >
          List
        </button>
        <button
          class="link-btn"
          :class="{ active: viewMode === 'grid' }"
          :aria-pressed="viewMode === 'grid'"
          @click="viewMode = 'grid'"
        >
          Grid
        </button>
        <button
          class="link-btn"
          :class="{ active: viewMode === 'map' }"
          :aria-pressed="viewMode === 'map'"
          @click="viewMode = 'map'"
        >
          Map
        </button>
      </div>
    </div>

    <div v-if="filterOpen && allTags.length" class="filter-panel thin-scroll">
      <button
        v-for="t in allTags"
        :key="t"
        type="button"
        class="filter-chip"
        :class="{ active: isTagActive(t) }"
        @click="toggleTag(t)"
      >
        {{ t }}
      </button>
    </div>

    <div v-if="viewMode === 'grid'" class="sub-header">
      <button
        v-for="opt in [
          { key: 'isoDate', label: 'Date' },
          { key: 'name', label: 'Name' },
          { key: 'location', label: 'Location' },
        ] as const"
        :key="opt.key"
        type="button"
        class="sort-btn"
        :class="{ active: sortKey === opt.key }"
        :aria-pressed="sortKey === opt.key"
        @click="toggleSort(opt.key)"
      >
        {{ opt.label }}
        <span
          v-if="sortKey === opt.key"
          class="sort-arrow"
          :class="{ desc: sortDir === 'desc' }"
          >▲</span
        >
      </button>
    </div>

    <div v-else-if="viewMode === 'map'" class="sub-header">
      <div class="date-field">
        From
        <span class="date-val">{{
          formatDayMonthYear(dateFrom) || "mm/dd/yyyy"
        }}</span>
        <span class="date-icon-wrap">
          <input v-model="dateFrom" type="date" class="date-native" />
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
            aria-hidden="true"
          >
            <rect x="2" y="3.5" width="12" height="11" rx="1" />
            <line x1="2" y1="7" x2="14" y2="7" />
            <line x1="5.5" y1="1.5" x2="5.5" y2="5" />
            <line x1="10.5" y1="1.5" x2="10.5" y2="5" />
          </svg>
        </span>
      </div>
      <div class="date-field">
        To
        <span class="date-val">{{
          formatDayMonthYear(dateTo) || "mm/dd/yyyy"
        }}</span>
        <span class="date-icon-wrap">
          <input v-model="dateTo" type="date" class="date-native" />
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
            aria-hidden="true"
          >
            <rect x="2" y="3.5" width="12" height="11" rx="1" />
            <line x1="2" y1="7" x2="14" y2="7" />
            <line x1="5.5" y1="1.5" x2="5.5" y2="5" />
            <line x1="10.5" y1="1.5" x2="10.5" y2="5" />
          </svg>
        </span>
      </div>
      <button
        v-if="dateFrom || dateTo"
        type="button"
        class="link-btn"
        @click="
          dateFrom = '';
          dateTo = '';
        "
      >
        Clear
      </button>
    </div>

    <div v-if="viewMode === 'map'" class="map-area">
      <MapView
        :rows="mapRows"
        :selected-slug="selectedSlug"
        :panel-open="mapPanelVisible && !!selected"
        @select="handleMapSelect"
      />
      <Transition name="slide-up">
        <MapPanel
          v-if="mapPanelVisible && selected"
          :restroom="selected"
          :active-tags="activeTags"
          @close="mapPanelVisible = false"
          @toggle-tag="toggleTag"
        />
      </Transition>
    </div>

    <template v-else>
      <div v-if="pending && !rows.length" class="state">Loading…</div>
      <div v-else-if="error" class="state error">Failed to load catalog.</div>
      <div v-else-if="!rows.length" class="state">No restrooms match.</div>
      <template v-else>
        <ListView
          v-if="viewMode === 'list'"
          :rows="rows"
          :selected-slug="selectedSlug"
          :sort-key="sortKey"
          :sort-dir="sortDir"
          :active-tags="activeTags"
          @select="select"
          @toggle-sort="toggleSort"
          @toggle-tag="toggleTag"
          @remove-tag="removeTag"
        />
        <GridView
          v-else-if="viewMode === 'grid'"
          :rows="rows"
          :selected-slug="selectedSlug"
          :active-tags="activeTags"
          @select="select"
          @toggle-tag="toggleTag"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.catalog {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  overflow: hidden;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  gap: 16px;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.sub-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 24px;
  border-bottom: 1px solid #000;
  font-size: 14px;
  flex: 0 0 auto;
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
  font-size: 14px;
  width: 110px;
  background: transparent;
  outline: none;
}

.search-icon {
  display: inline-flex;
  align-items: center;
}

.search-icon.clear {
  background: transparent;
  border: 0;
  cursor: pointer;
}

.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  color: #000;
}

.sort-btn.active {
  color: #000;
}

.sort-arrow {
  font-size: 10px;
  line-height: 1;
  transition: transform 0.15s;
}

.sort-arrow.desc {
  transform: rotate(180deg);
}

.date-field {
  font: inherit;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-val {
  color: #666;
  font-size: 14px;
  box-shadow: 0 1px 0 #000;
}

.date-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: #000;
  isolation: isolate;
}

.date-icon-wrap:hover {
  color: #555;
}

.date-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
  padding: 0;
  margin: 0;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 14px;
  cursor: pointer;
  color: #000;
}

.link-btn.active {
  color: #595959;
}

/* Hover tint for the control bar's text buttons — previews the `.active`
   color. Gated on a real pointer so a tap on a touch device doesn't leave it
   stuck until the next tap. */
@media (hover: hover) {
  .link-btn:hover {
    color: #595959;
  }
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.filter-btn.active {
  color: #000;
}

.filter-caret {
  display: inline-block;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.15s;
  transform: rotate(0deg);
}

.filter-caret.open {
  transform: rotate(90deg);
}

.filter-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid #000;
  flex: 0 0 auto;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  background: #fff;
  color: #000;
  border: 1px solid #000;
  border-radius: 3px;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.1s,
    color 0.1s;
}

.filter-chip:hover:not(.active) {
  background: #f0f0f0;
}

.filter-chip.active {
  background: #000;
  color: #fff;
}

.view-mode {
  display: flex;
  gap: 20px;
}

.map-area {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

@media (max-width: 750px) {
  .slide-up-enter-from,
  .slide-up-leave-to {
    transform: translateX(-100%);
  }
}

.state {
  padding: 24px;
  color: #666;
}

.state.error {
  color: #c33;
}

/* Compact scale, keyed to the panel's width at the same 560px where
   `ListView`'s own container queries step down — so the controls strip and the
   list shrink together instead of the list going alone at a 1120px viewport. */
@container panel (max-width: 560px) {
  .catalog {
    font-size: 12px;
  }
  .controls {
    gap: 8px;
    padding: 6px 8px;
  }
  .controls-left {
    gap: 12px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .view-mode {
    flex-shrink: 0;
    gap: 12px;
  }
  /* Matches `ListView`'s `.thead` padding. The two are alternates of the same
     strip row — `measureStrip` sizes the expand tab off whichever one is
     mounted — so a mismatch resizes the tab when switching views. */
  .sub-header {
    padding: 8px 12px;
  }
  .link-btn,
  .sort-btn,
  .date-field,
  .date-val {
    font-size: 12px;
  }
  .search input {
    font-size: 12px;
    width: 60px;
  }
  .filter-panel {
    padding: 8px 8px;
  }
}

/* Sheet layout, not a width step: the panel is a short top-anchored sheet, so
   the filter panel caps its own height rather than crowding out the list. */
@media (max-width: 750px) {
  .filter-panel {
    max-height: 75px;
    overflow: auto;
  }
}
</style>
