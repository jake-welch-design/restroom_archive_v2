<script setup lang="ts">
import type { RestroomSummary } from "~/types/restroom";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";

type SortKey = "isoDate" | "name" | "location";
type SortDir = "asc" | "desc";

const props = defineProps<{
  rows: RestroomSummary[];
  selectedSlug: string | null;
  sortKey: SortKey;
  sortDir: SortDir;
  activeTags: string[];
}>();

const emit = defineEmits<{
  select: [slug: string];
  toggleSort: [key: SortKey];
  toggleTag: [tag: string];
  removeTag: [tag: string];
}>();

// Previously-used descriptors across all loaded restrooms, ordered by
// frequency. Feeds the tag suggestion dropdown when editing an entry.
const descriptorSuggestions = computed(() => {
  const counts = new Map<string, { display: string; count: number }>();
  for (const r of props.rows) {
    for (const tag of r.descriptors ?? []) {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { display: tag, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .map((e) => e.display);
});

const { isAdmin, user } = useAuth();

// Admins edit anything; archivists edit the info on their own submissions.
// Usernames are unique, so they're enough to match without exposing ids.
function canEdit(r: RestroomSummary) {
  if (isAdmin.value) return true;
  const u = user.value as { username?: string } | null;
  return !!u?.username && r.submitter?.username === u.username;
}

const tbodyRef = ref<HTMLUListElement | null>(null);

// Only the rows scroll, so the bar starts under the header instead of running
// the table's full height beside it. That does put the bar inside the rows'
// box, width the header does not lose, so the header is pulled in by the same
// amount (see `.thead`'s `margin-right`) and the two stay column-aligned.
// Measured off the live scroller rather than assumed: the reserved width is
// `.thin-scroll`'s 8px in Chrome/Safari but Firefox's own `thin` metric there.
const scrollbarWidth = ref(0);
let tbodyRo: ResizeObserver | null = null;

function measureScrollbar() {
  const el = tbodyRef.value;
  if (el) scrollbarWidth.value = el.offsetWidth - el.clientWidth;
}

onMounted(() => {
  measureScrollbar();
  if (!tbodyRef.value) return;
  tbodyRo = new ResizeObserver(measureScrollbar);
  tbodyRo.observe(tbodyRef.value);
});

onBeforeUnmount(() => {
  tbodyRo?.disconnect();
  tbodyRo = null;
});

async function scrollToSelected(slug: string | null | undefined) {
  if (!slug || !tbodyRef.value) return;
  await nextTick();
  const el = tbodyRef.value.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
  if (el) scrollRowIntoView(tbodyRef.value, el);
}

watch(() => props.selectedSlug, scrollToSelected);
onMounted(() => scrollToSelected(props.selectedSlug));

// Edit state. The form itself is EntryEditForm; this is only which row has it
// open, and whether it opened full screen. Read once, at the tap, so turning
// the phone over mid-edit does not swap the form out from under the keyboard.
const editingSlug = ref<string | null>(null);
const editFullscreen = ref(false);

function startEdit(r: RestroomSummary, e: Event) {
  e.stopPropagation();
  editFullscreen.value = window.matchMedia("(max-width: 750px)").matches;
  editingSlug.value = r.slug;
}

function sortArrow(key: SortKey) {
  if (props.sortKey !== key) return "";
  return props.sortDir === "asc" ? "▲" : "▼";
}

// The name cell is a real `<a href="/r/:slug">` so the catalog links the pages
// it lists — without it every entry is an orphan that only the sitemap knows
// about. Selection is still the row's own @click (which rewrites the URL via
// replaceState), so a plain click must not let the browser navigate on top of
// it. Modified clicks are left alone: cmd/middle-click opens the entry in a new
// tab, which the old <li>-only row couldn't do.
function onNameClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
    return;
  e.preventDefault();
}
</script>

<template>
  <div class="table-wrap" :style="{ '--sbw': `${scrollbarWidth}px` }">
    <div class="thead">
      <button
        type="button"
        class="th col-date"
        :aria-pressed="sortKey === 'isoDate'"
        @click="emit('toggleSort', 'isoDate')"
      >
        Date <span class="arrow">{{ sortArrow("isoDate") }}</span>
      </button>
      <button
        type="button"
        class="th col-name"
        :aria-pressed="sortKey === 'name'"
        @click="emit('toggleSort', 'name')"
      >
        Name <span class="arrow">{{ sortArrow("name") }}</span>
      </button>
      <button
        type="button"
        class="th col-loc"
        :aria-pressed="sortKey === 'location'"
        @click="emit('toggleSort', 'location')"
      >
        Location <span class="arrow">{{ sortArrow("location") }}</span>
      </button>
    </div>

    <ul ref="tbodyRef" class="tbody thin-scroll">
      <li
        v-for="r in rows"
        :key="r.id"
        :data-slug="r.slug"
        class="row"
        :class="{ selected: r.slug === selectedSlug }"
        @click="emit('select', r.slug)"
      >
        <div class="row-main">
          <div class="col-date">{{ formatDayMonthYear(r.isoDate) }}</div>
          <div class="col-name">
            <a class="name-link" :href="`/r/${r.slug}`" @click="onNameClick">{{
              r.name
            }}</a>
          </div>
          <div class="col-loc">
            <span class="col-loc-text">{{ r.location }}</span>
            <!-- Sits on the row's own line, baseline-aligned with the location
                 it shares the column with, rather than down in the description. -->
            <button
              v-if="
                canEdit(r) && r.slug === selectedSlug && editingSlug !== r.slug
              "
              type="button"
              class="edit-link"
              @click="startEdit(r, $event)"
            >
              Edit
            </button>
          </div>
        </div>

        <div v-if="r.slug === selectedSlug" class="row-expanded">
          <EntryEditForm
            v-if="editingSlug === r.slug"
            :entry="r"
            :fullscreen="editFullscreen"
            :suggestions="descriptorSuggestions"
            @close="editingSlug = null"
          />

          <!-- Read view -->
          <div v-else class="description">
            <p class="desc-text">
              {{ r.description ?? "No description yet." }}
            </p>

            <UserAttribution
              class="submitter-line"
              :user="r.submitter"
              prefix="Uploaded by "
            />

            <DescriptorChips
              class="row-chips"
              :tags="r.descriptors ?? []"
              :active-tags="activeTags"
              @toggle-tag="emit('toggleTag', $event)"
            />

            <div class="annotations-section">
              <AnnotationList :slug="r.slug" />
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.table-wrap {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  /* Just stacks the header above the rows. `.tbody` owns the scroll, so the
     bar starts below the header rather than running up alongside it. The catch
     that used to keep the scroll here: a bar inside the rows' box lays their
     three columns out across less width than the header's, drifting them left
     of their labels. `.thead` gives that width back as a right margin. */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: Arial, Helvetica, sans-serif;
  container-type: inline-size;
}
.thead {
  /* Held off the edge by exactly the width the rows' scrollbar takes (measured
     into `--sbw`), which lines the header's columns up with the rows' and ends
     its bottom rule flush with theirs instead of 8px past them. */
  margin-right: var(--sbw, 0px);
  background: #fff;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 10px 24px;
  border-top: none;
  border-bottom: 1px solid #000;
  font-size: 14px;
  flex: 0 0 auto;
}
.th {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: #000;
  cursor: pointer;
}
.th .arrow {
  font-size: 10px;
  line-height: 1;
  color: #000;
}
.col-name {
  order: 1;
}
/* Inherits everything so the cell reads exactly as the bare text it replaced;
   the row above it still owns the hover and cursor. */
.name-link {
  color: inherit;
  text-decoration: none;
}
.col-date {
  order: 2;
}
.col-loc {
  order: 3;
}
/* Row cells only. `.col-loc` is also the `.thead` sort button, which must keep
   its arrow next to the label rather than pushed to the far edge. */
.row-main .col-loc {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.col-loc-text {
  min-width: 0;
}
.tbody {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1 1 auto;
  min-height: 0;
  /* `scroll` rather than `auto` so the gutter is reserved whether or not the
     list currently overflows. Otherwise filtering down to a handful of rows
     would drop the bar and slide every column 8px right. */
  overflow-y: scroll;
  overflow-x: hidden;
}
.row {
  border-bottom: 1px solid #000;
  cursor: pointer;
}
.row:hover:not(.selected) {
  background: #f4f4f4;
}
.row-main {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 8px 24px;
  font-size: 14px;
  align-items: start;
  min-height: 20px;
}
.row.selected {
  background: #fff;
}
.row-expanded {
  padding: 0 24px 0;
}
/* Section rules, in place of the old "Description:" and "Descriptors:" headers:
   the same light divider the account tab uses. The top padding lives here
   rather than on `.row-expanded` so the rule sits directly under the row. */
.description {
  border-top: 1px solid #e8e8e8;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Read view */
.desc-text {
  margin: 0;
  color: #000;
  font-size: 14px;
  line-height: 1.35;
}
/* Matches the `.annotation-meta` below the divider. */
.submitter-line {
  color: #999;
  font-size: 12px;
}
.edit-link {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  /* Secondary action: stays small next to the 14px row text it aligns with. */
  font-size: 12px;
  color: #595959;
  cursor: pointer;
  flex-shrink: 0;
}
.edit-link:hover {
  color: #000;
}

/* Annotations */
.annotations-section {
  /* No margin of its own: `.description`'s 10px gap already separates it, and
     adding to that put the divider twice as far below the attribution as the
     description, tags and attribution sit from each other. */
  margin-bottom: 12px;
  padding-top: 12px;
  border-top: 1px solid #e8e8e8;
}
/* Responsive columns via container queries */
@container (max-width: 560px) {
  .thead {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
  }
  .th {
    font-size: 12px;
  }
  .row-main {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 6px 12px;
    font-size: 12px;
  }
  /* Keeps the section dividers inset to the same gutter as the row text. */
  .row-expanded {
    padding: 0 12px 0px;
  }
  .desc-text {
    font-size: 12px;
  }
}

@container (max-width: 400px) {
  .thead {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 8px 10px;
  }
  .row-main {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 6px 10px;
  }
  .row-expanded {
    padding: 0 10px 0px;
  }
}
</style>
