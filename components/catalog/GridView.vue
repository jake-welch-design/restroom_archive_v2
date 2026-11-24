<script setup lang="ts">
import type { CatalogRow } from "~/types/restroom";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";

/**
 * Thumbnail grid of the catalog.
 *
 * A tile shows its scan's thumbnail with the name, date and location overlaid.
 * The selected tile swaps that for its detail in place, keeping the grid's
 * geometry intact so the surrounding tiles do not reflow.
 *
 * Column count and margins follow the panel's width rather than the window's.
 * Keyed to the window they stepped the wrong way at the layout switch: a 376px
 * panel still received three columns while a 700px one dropped to two.
 */
const props = defineProps<{
  rows: CatalogRow[];
  selectedSlug: string | null;
  activeTags: string[];
  /** The viewer's chosen column count; null leaves it to the panel's width. */
  columns?: 1 | 2 | 3 | null;
}>();

// One or two columns make tiles big enough to carry the list's type rather
// than the grid's smaller tile type, so they take list view's sizes: the text
// classes below, and the comfortable density of the chips and annotations.
// Only for a chosen count; the narrow panel's automatic two columns keep the
// tile sizes they always had.
const listSized = computed(() => props.columns === 1 || props.columns === 2);
const density = computed(() => (listSized.value ? "comfortable" : "compact"));

// Inline, so a chosen count outranks the container query's narrow-panel step.
const gridStyle = computed(() =>
  props.columns
    ? { gridTemplateColumns: `repeat(${props.columns}, 1fr)` }
    : undefined,
);

const emit = defineEmits<{
  select: [slug: string];
  toggleTag: [tag: string];
}>();

const gridWrapRef = ref<HTMLDivElement | null>(null);

// The scrollbar sits in the right-hand gutter, as the list's does, rather than
// inside it, where it set the tiles 8px further from the right edge than the
// left. The gutter's right padding gives up exactly the bar's width. Measured
// as ListView does: `.thin-scroll`'s 8px in Chrome and Safari, Firefox's own
// `thin` width there. The CSS falls back to 8px until this runs.
const scrollbarWidth = ref<number | null>(null);
let wrapRo: ResizeObserver | null = null;

function measureScrollbar() {
  const el = gridWrapRef.value;
  if (el) scrollbarWidth.value = el.offsetWidth - el.clientWidth;
}

onMounted(() => {
  measureScrollbar();
  if (!gridWrapRef.value) return;
  wrapRo = new ResizeObserver(measureScrollbar);
  wrapRo.observe(gridWrapRef.value);
});

onBeforeUnmount(() => {
  wrapRo?.disconnect();
  wrapRo = null;
});

/**
 * Brings the selected tile into view. Selection can originate outside the grid
 * (the viewer's next/previous controls, a deep link), in which case the tile may
 * be well off screen.
 */
async function scrollToSelected(slug: string | null | undefined) {
  if (!slug || !gridWrapRef.value) return;
  await nextTick();
  const el = gridWrapRef.value.querySelector<HTMLElement>(
    `[data-slug="${slug}"]`,
  );
  if (el) scrollRowIntoView(gridWrapRef.value, el);
}

watch(() => props.selectedSlug, scrollToSelected);
onMounted(() => scrollToSelected(props.selectedSlug));

/**
 * An unselected tile is a real `<a href="/r/:slug">` so the grid links the
 * pages it lists; without it every entry is an orphan only the sitemap knows
 * about. The selected tile is a plain `<div>`: a link to the entry already open
 * is worth nothing, and its expanded state nests its own buttons (descriptor
 * chips, the annotations toggle and its delete buttons), which may live inside
 * neither an anchor nor a button.
 *
 * It was a `<button>`, and a nested button is worse than merely invalid: the
 * HTML parser ends the outer one where the inner one starts, so the browser
 * built a tree the server never rendered — the rest of the tile, and every tile
 * after it, hoisted out of the grid, some of it clear out of the panel. Vue
 * then hydrated against that tree, and the leftovers stayed behind as loose
 * full-width tiles below the catalog, tall enough to scroll the panel's own
 * header and view controls off the top of the screen.
 *
 * Selection still happens here, so a plain click must not let the browser
 * navigate on top of it. Modified clicks are left alone: cmd/middle-click opens
 * the entry in a new tab, which the old <button> tile couldn't do.
 */
function onTileClick(slug: string, e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
    return;
  e.preventDefault();
  emit("select", slug);
}
</script>

<template>
  <div
    ref="gridWrapRef"
    class="grid-wrap thin-scroll"
    :class="{
      'list-sized': listSized,
      single: columns === 1,
      triple: columns === 3,
    }"
    :style="
      scrollbarWidth === null ? undefined : { '--sbw': `${scrollbarWidth}px` }
    "
  >
    <div class="grid" :style="gridStyle">
      <component
        :is="r.slug === selectedSlug ? 'div' : 'a'"
        v-for="r in rows"
        :key="r.id"
        :data-slug="r.slug"
        :href="r.slug === selectedSlug ? undefined : `/r/${r.slug}`"
        class="tile"
        :class="{ selected: r.slug === selectedSlug }"
        @click="onTileClick(r.slug, $event)"
      >
        <div class="thumb">
          <template v-if="r.slug === selectedSlug">
            <div class="expanded thin-scroll" @click.stop>
              <div class="tile-info selected">
                <span class="tile-name"
                  ><SearchHighlight :text="r.name"
                /></span>
                <ArchiveDate
                  class="tile-date"
                  :scans="r.scans"
                  :slug="r.slug"
                  :iso-date="r.isoDate"
                  @select="emit('select', $event)"
                />
                <span class="tile-location"
                  ><SearchHighlight
                    :text="r.location"
                    kind="location"
                    :country="r.country"
                /></span>
              </div>

              <p class="desc-text">
                <SearchHighlight v-if="r.description" :text="r.description" />
                <template v-else>No description yet.</template>
              </p>

              <UserAttribution
                class="submitter-line"
                :user="r.submitter"
                prefix="Uploaded by "
              />

              <DescriptorChips
                :tags="r.descriptors ?? []"
                :active-tags="activeTags"
                :density="density"
                @toggle-tag="emit('toggleTag', $event)"
              />

              <div class="annotations-section">
                <AnnotationList :slug="r.slug" :density="density" />
              </div>
            </div>
          </template>
          <template v-else>
            <img
              v-if="r.thumbUrl"
              :src="r.thumbUrl"
              :alt="r.name"
              loading="lazy"
            />
            <div v-else class="thumb-placeholder" />
            <div class="tile-info">
              <span class="tile-name"><SearchHighlight :text="r.name" /></span>
              <span class="tile-date"
                ><SearchHighlight
                  :text="formatDayMonthYear(r.isoDate)"
                  kind="date"
              /></span>
              <span class="tile-location"
                ><SearchHighlight
                  :text="r.location"
                  kind="location"
                  :country="r.country"
              /></span>
            </div>
          </template>
        </div>
      </component>
    </div>
  </div>
</template>

<style scoped>
/* The side gutters are padding rather than margin so the scroller runs to the
   panel's edges and its bar lands inside the right gutter. `scroll`, not
   `auto`, keeps that bar's space reserved, so filtering down to a few tiles
   doesn't drop it and widen the grid. Top and bottom stay margins: the scroll
   area keeps its gap below the header, and scrolling a tile into view still
   stops 16px under it. */
.grid-wrap {
  --gutter: 16px;
  flex: 1 1 auto;
  overflow-y: scroll;
  margin: var(--gutter) 0;
  padding: 0 max(0px, calc(var(--gutter) - var(--sbw, 8px))) 0 var(--gutter);
  font-family: Arial, Helvetica, sans-serif;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
/* The grid fills the panel, so its margin and column count follow the panel's
   width on the same steps as the rest of the panel, not the window's. Keyed to
   the window these went the wrong way at the 750px layout switch: a 376px panel
   still got three columns (107px tiles) while a 700px one dropped to two. */
@container panel (max-width: 560px) {
  .grid-wrap {
    --gutter: 8px;
  }
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@container panel (max-width: 400px) {
  .grid {
    gap: 8px;
  }
}
/* Shared by both tile elements: the <div> the selected tile renders as, and the
   <a> every other tile renders as, so the two read as one grid. */
.tile {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  display: block;
  color: inherit;
  text-decoration: none;
  font: inherit;
}
.thumb {
  /* How far the hover rings reach in from the tile's edge. The thumbnail and
     its text sit inside that inset, so they shrink to make room for the rings
     rather than being covered by them, while the tile's own size never
     changes. */
  --ring: 0px;
  width: 100%;
  aspect-ratio: 1;
  box-sizing: border-box;
  padding: var(--ring);
  background: var(--surface);
  overflow: hidden;
  position: relative;
}
/* Hover: a 1px black line around the edge with 2px of white inside it. The line
   is an inset shadow, which paints under the content, and the white is the
   tile's own background, so both show only in the padding the thumbnail gives
   up. Gated
   on a real pointer so a tap doesn't leave a tile ringed, and shown on keyboard
   focus too, as the tile is a link. */
@media (hover: hover) {
  .tile:hover:not(.selected) .thumb {
    --ring: 3px;
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
}
.tile:focus-visible {
  outline: none;
}
.tile:focus-visible .thumb {
  --ring: 3px;
  background: var(--paper);
  box-shadow: inset 0 0 0 1px var(--ink);
}
/* Resting outline (`--grid-edge`, dark mode only). Drawn over the thumbnail,
   which an inset shadow would sit under. Hover, focus and the open tile have
   their own full-strength rings, so it steps aside for those. */
.thumb::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid var(--grid-edge);
  pointer-events: none;
}
.tile:focus-visible .thumb::after,
.tile.selected .thumb::after {
  display: none;
}
@media (hover: hover) {
  .tile:hover .thumb::after {
    display: none;
  }
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  background: #000;
}
.tile-info {
  position: absolute;
  top: var(--ring);
  left: var(--ring);
  right: var(--ring);
  padding: 10px 12px 28px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #fff;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.55) 0%,
    rgba(0, 0, 0, 0.3) 60%,
    rgba(0, 0, 0, 0) 100%
  );
}
.tile-info.selected {
  position: static;
  color: var(--ink);
  text-shadow: none;
  padding: 0;
  pointer-events: auto;
  background: none;
}
.expanded {
  width: 100%;
  height: 100%;
  background: var(--paper);
  border: 1px solid var(--ink);
  padding: 10px 12px;
  overflow-y: auto;
  box-sizing: border-box;
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.desc-text {
  margin: 0;
  color: var(--ink);
  font-size: 11px;
  line-height: 1.35;
}
/* Matches the compact `.annotation-meta` directly below it. */
.submitter-line {
  color: var(--faint);
  font-size: 11px;
}
.annotations-section {
  margin-top: auto;
}

/* List view's sizes (ListView's `.row-main`, `.desc-text` and
   `.submitter-line`), stepping down at the same 560px panel width it does. */
.list-sized .tile-info,
.list-sized .desc-text {
  font-size: 14px;
}
.list-sized .submitter-line {
  font-size: 12px;
}
/* In a single column the open tile is the panel's full width, and kept square
   it is mostly empty white below the details. There it shrinks to fit them
   instead. With no tile beside it, only the tiles below shift. In two and three
   columns it stays square, so a row's tiles stay level. */
.single .tile.selected .thumb {
  aspect-ratio: auto;
}
.single .expanded {
  height: auto;
  overflow-y: visible;
}

@container panel (max-width: 560px) {
  .list-sized .tile-info,
  .list-sized .desc-text {
    font-size: 12px;
  }
}

/* Three columns chosen on a phone: tiles about a third of the screen wide,
   too narrow for the grid's 12px tile type, which wraps a name onto three
   lines and covers most of the scan. A size down, with the padding taken in to
   match. Only for a chosen count; the phone's automatic two columns keep the
   usual sizes. */
@media (max-width: 750px) {
  .triple .tile-info {
    padding: 7px 8px 18px;
    gap: 1px;
    font-size: 10px;
  }
  .triple .tile-info.selected {
    padding: 0;
  }
  .triple .expanded {
    padding: 7px 8px;
    gap: 7px;
  }
  .triple .desc-text,
  .triple .submitter-line {
    font-size: 10px;
  }
}
</style>
