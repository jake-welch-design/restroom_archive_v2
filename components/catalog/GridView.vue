<script setup lang="ts">
import type { RestroomSummary } from "~/types/restroom";
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
  rows: RestroomSummary[];
  selectedSlug: string | null;
  activeTags: string[];
}>();

const emit = defineEmits<{
  select: [slug: string];
  toggleTag: [tag: string];
}>();

const gridWrapRef = ref<HTMLDivElement | null>(null);

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
  el?.scrollIntoView({ block: "start", behavior: "smooth" });
}

watch(() => props.selectedSlug, scrollToSelected);
onMounted(() => scrollToSelected(props.selectedSlug));

/**
 * An unselected tile is a real `<a href="/r/:slug">` so the grid links the
 * pages it lists; without it every entry is an orphan only the sitemap knows
 * about. The selected tile stays a `<button>` because its expanded state nests
 * its own buttons (descriptor chips, annotations), which may not live inside an
 * anchor — and a link to the entry already open is worth nothing anyway.
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
  <div ref="gridWrapRef" class="grid-wrap thin-scroll">
    <div class="grid">
      <component
        :is="r.slug === selectedSlug ? 'button' : 'a'"
        v-for="r in rows"
        :key="r.id"
        :data-slug="r.slug"
        v-bind="
          r.slug === selectedSlug
            ? { type: 'button' }
            : { href: `/r/${r.slug}` }
        "
        class="tile"
        :class="{ selected: r.slug === selectedSlug }"
        @click="onTileClick(r.slug, $event)"
      >
        <div class="thumb">
          <template v-if="r.slug === selectedSlug">
            <div class="expanded thin-scroll" @click.stop>
              <div class="tile-info selected">
                <span class="tile-name">{{ r.name }}</span>
                <span class="tile-date">{{
                  formatDayMonthYear(r.isoDate)
                }}</span>
                <span class="tile-location">{{ r.location }}</span>
              </div>

              <p class="desc-text">
                {{ r.description ?? "No description yet." }}
              </p>

              <UserAttribution
                class="submitter-line"
                :user="r.submitter"
                prefix="Uploaded by "
              />

              <DescriptorChips
                :tags="r.descriptors ?? []"
                :active-tags="activeTags"
                density="compact"
                @toggle-tag="emit('toggleTag', $event)"
              />

              <div class="annotations-section">
                <AnnotationList :slug="r.slug" density="compact" />
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
              <span class="tile-name">{{ r.name }}</span>
              <span class="tile-date">{{ formatDayMonthYear(r.isoDate) }}</span>
              <span class="tile-location">{{ r.location }}</span>
            </div>
          </template>
        </div>
      </component>
    </div>
  </div>
</template>

<style scoped>
.grid-wrap {
  flex: 1 1 auto;
  overflow-y: auto;
  margin: 16px;
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
    margin: 8px;
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
/* Shared by both tile elements: the <button> the selected tile renders as, and
   the <a> every other tile renders as. The link inherits so it reads exactly as
   the button it replaced. */
.tile {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  display: block;
  color: inherit;
  text-decoration: none;
  /* A <button> takes the UA's own font rather than inheriting, an <a> inherits.
     Without this the selected tile and the rest would disagree on font family in
     browsers whose button font isn't Arial. Both now take `.grid-wrap`'s. */
  font: inherit;
}
.tile:hover:not(.selected) .thumb img,
.tile:hover:not(.selected) .thumb-placeholder {
  opacity: 0.8;
}
.thumb {
  width: 100%;
  aspect-ratio: 1;
  background: #f0f0f0;
  overflow: hidden;
  position: relative;
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
  top: 0;
  left: 0;
  right: 0;
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
  color: #000;
  text-shadow: none;
  padding: 0;
  pointer-events: auto;
  background: none;
}
.expanded {
  width: 100%;
  height: 100%;
  background: #fff;
  border: 1px solid #000;
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
  color: #000;
  font-size: 11px;
  line-height: 1.35;
}
/* Matches the compact `.annotation-meta` directly below it. */
.submitter-line {
  color: #999;
  font-size: 11px;
}
.annotations-section {
  margin-top: auto;
}
</style>
