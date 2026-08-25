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
  el?.scrollIntoView({ block: "start", behavior: "smooth" });
}

watch(() => props.selectedSlug, scrollToSelected);
onMounted(() => scrollToSelected(props.selectedSlug));

// Edit state
const editingSlug = ref<string | null>(null);
const editForm = reactive({
  name: "",
  location: "",
  isoDate: "",
  lat: "",
  lng: "",
  description: "",
  descriptors: [] as string[],
});
const editLoading = ref(false);
const editError = ref("");

function startEdit(r: RestroomSummary, e: Event) {
  e.stopPropagation();
  editingSlug.value = r.slug;
  editForm.name = r.name;
  editForm.location = r.location;
  editForm.isoDate = r.isoDate;
  editForm.lat = r.lat != null ? String(r.lat) : "";
  editForm.lng = r.lng != null ? String(r.lng) : "";
  editForm.description = r.description ?? "";
  editForm.descriptors = [...(r.descriptors ?? [])];
  editError.value = "";
}

function cancelEdit(e: Event) {
  e.stopPropagation();
  editingSlug.value = null;
  editError.value = "";
}

async function saveEdit(slug: string, e: Event) {
  e.stopPropagation();
  editLoading.value = true;
  editError.value = "";
  try {
    await $fetch(`/api/restrooms/${slug}`, {
      method: "PATCH",
      body: {
        name: editForm.name,
        location: editForm.location,
        isoDate: editForm.isoDate,
        lat: editForm.lat !== "" ? Number(editForm.lat) : null,
        lng: editForm.lng !== "" ? Number(editForm.lng) : null,
        description: editForm.description || null,
        descriptors: editForm.descriptors,
      },
    });
    editingSlug.value = null;
    await refreshNuxtData("restrooms");
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string } };
    editError.value = e.data?.statusMessage ?? "Save failed.";
  } finally {
    editLoading.value = false;
  }
}

function sortArrow(key: SortKey) {
  if (props.sortKey !== key) return "";
  return props.sortDir === "asc" ? "▲" : "▼";
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
          <div class="col-name">{{ r.name }}</div>
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
          <!-- Edit form -->
          <form
            v-if="editingSlug === r.slug"
            class="edit-form"
            @submit.prevent="saveEdit(r.slug, $event)"
            @click.stop
          >
            <div class="edit-grid">
              <label class="edit-field">
                <span class="edit-label">Name</span>
                <input
                  v-model="editForm.name"
                  type="text"
                  required
                  class="edit-input"
                />
              </label>
              <label class="edit-field">
                <span class="edit-label">Location</span>
                <input
                  v-model="editForm.location"
                  type="text"
                  required
                  class="edit-input"
                />
              </label>
              <label class="edit-field">
                <span class="edit-label">Date</span>
                <input
                  v-model="editForm.isoDate"
                  type="date"
                  required
                  class="edit-input"
                />
              </label>
              <div class="edit-field-row">
                <label class="edit-field">
                  <span class="edit-label">Lat</span>
                  <input
                    v-model="editForm.lat"
                    type="number"
                    step="any"
                    class="edit-input"
                  />
                </label>
                <label class="edit-field">
                  <span class="edit-label">Lng</span>
                  <input
                    v-model="editForm.lng"
                    type="number"
                    step="any"
                    class="edit-input"
                  />
                </label>
              </div>
              <label class="edit-field edit-field-full">
                <span class="edit-label">Description</span>
                <textarea
                  v-model="editForm.description"
                  class="edit-input edit-textarea"
                  maxlength="1000"
                  rows="3"
                  @click.stop
                />
              </label>
              <div class="edit-field edit-field-full" @click.stop>
                <span class="edit-label">Descriptors</span>
                <TagInput
                  v-model="editForm.descriptors"
                  :suggestions="descriptorSuggestions"
                />
              </div>
            </div>
            <p v-if="editError" class="edit-error">{{ editError }}</p>
            <div class="edit-actions">
              <button
                type="submit"
                class="edit-btn edit-btn-save"
                :disabled="editLoading"
              >
                {{ editLoading ? "Saving…" : "Save" }}
              </button>
              <button
                type="button"
                class="edit-btn edit-btn-cancel"
                @click="cancelEdit($event)"
              >
                Cancel
              </button>
            </div>
          </form>

          <!-- Read view -->
          <div v-else class="description">
            <p class="desc-text">
              {{ r.description ?? "No description yet." }}
            </p>

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
.description,
.edit-form {
  border-top: 1px solid #e8e8e8;
  padding-top: 12px;
}
.description {
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
  margin-top: 10px;
  margin-bottom: 12px;
  padding-top: 12px;
  border-top: 1px solid #e8e8e8;
}
/* Edit form */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.edit-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.edit-field-full {
  grid-column: 1 / -1;
}
.edit-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.edit-label {
  font-size: 12px;
  color: #666;
}
.edit-input {
  border: 0;
  border-bottom: 1px solid #000;
  padding: 3px 0;
  font: inherit;
  font-size: 14px;
  background: transparent;
  outline: none;
  color: #000;
  width: 100%;
}
.edit-textarea {
  border: 1px solid #000;
  padding: 4px 6px;
  resize: vertical;
}
.edit-error {
  margin: 0;
  font-size: 13px;
  color: #c33;
}
.edit-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.edit-btn {
  background: transparent;
  border: 1px solid #000;
  padding: 3px 10px;
  font: inherit;
  /* Matches `.edit-label` on the fields above it. */
  font-size: 12px;
  cursor: pointer;
}
.edit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.edit-btn-save:hover:not(:disabled) {
  background: #000;
  color: #fff;
}
.edit-btn-cancel:hover {
  background: #f4f4f4;
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
  .edit-input {
    font-size: 12px;
  }
  .edit-error {
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
