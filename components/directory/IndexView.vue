<script setup lang="ts">
import type { RestroomSummary } from "~/types/restroom";
import type { Annotation } from "~/types/annotation";

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

function isTagActive(tag: string) {
  const lower = tag.toLowerCase();
  return props.activeTags.some((t) => t.toLowerCase() === lower);
}

const { isAdmin, loggedIn, user } = useAuth();
const { selectAnnotation } = useSelection();

// Annotations for the expanded row
const expandedSlug = computed(() => props.selectedSlug);
const { data: annotations, refresh: refreshAnnotations } =
  useAnnotations(expandedSlug);

// Removal request state
const removalSlug = ref<string | null>(null);
const removalReason = ref("");
const removalLoading = ref(false);
const removalError = ref("");

async function submitRemoval(slug: string) {
  removalLoading.value = true;
  removalError.value = "";
  try {
    await $fetch(`/api/restrooms/${slug}/request-removal`, {
      method: "POST",
      body: { reason: removalReason.value || undefined },
    });
    removalSlug.value = null;
    removalReason.value = "";
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    removalError.value = err.data?.statusMessage ?? "Failed to submit request.";
  } finally {
    removalLoading.value = false;
  }
}

// Annotations collapse
const annotationsOpen = ref(false);

// Annotation delete
const deletingId = ref<number | null>(null);
async function deleteAnnotation(slug: string, id: number) {
  deletingId.value = id;
  try {
    await $fetch(`/api/restrooms/${slug}/annotations/${id}`, {
      method: "DELETE",
    });
    await refreshAnnotations();
  } finally {
    deletingId.value = null;
  }
}

function authorLabel(a: Annotation) {
  return a.author.displayName ?? a.author.email;
}

function shortDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const tbodyRef = ref<HTMLUListElement | null>(null);

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

function formatShortDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}
</script>

<template>
  <div class="table-wrap">
    <div class="thead">
      <button
        type="button"
        class="th col-date"
        @click="emit('toggleSort', 'isoDate')"
      >
        Date <span class="arrow">{{ sortArrow("isoDate") }}</span>
      </button>
      <button
        type="button"
        class="th col-name"
        @click="emit('toggleSort', 'name')"
      >
        Name <span class="arrow">{{ sortArrow("name") }}</span>
      </button>
      <button
        type="button"
        class="th col-loc"
        @click="emit('toggleSort', 'location')"
      >
        Location <span class="arrow">{{ sortArrow("location") }}</span>
      </button>
    </div>

    <ul ref="tbodyRef" class="tbody">
      <li
        v-for="r in rows"
        :key="r.id"
        :data-slug="r.slug"
        class="row"
        :class="{ selected: r.slug === selectedSlug }"
        @click="emit('select', r.slug)"
      >
        <div class="row-main">
          <div class="col-date">{{ formatShortDate(r.isoDate) }}</div>
          <div class="col-name">{{ r.name }}</div>
          <div class="col-loc">{{ r.location }}</div>
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
                <TagInput v-model="editForm.descriptors" />
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
            <div class="desc-row">
              <div>
                <div class="label">Description:</div>
                <p class="desc-text">
                  {{ r.description ?? "No description yet." }}
                </p>
              </div>
              <button
                v-if="isAdmin"
                type="button"
                class="edit-link"
                @click="startEdit(r, $event)"
              >
                Edit
              </button>
            </div>

            <!-- Descriptors -->
            <div v-if="r.descriptors?.length" class="descriptors-section" @click.stop>
              <div class="label">Descriptors:</div>
              <div class="descriptor-chips">
                <button
                  v-for="t in r.descriptors"
                  :key="t"
                  type="button"
                  class="tag-chip row-chip"
                  :class="{ active: isTagActive(t) }"
                  @click.stop="emit('toggleTag', t)"
                >
                  {{ t }}
                </button>
              </div>
            </div>

            <!-- Annotations -->
            <div class="annotations-section" @click.stop>
              <button
                type="button"
                class="annotations-toggle"
                @click.stop="annotationsOpen = !annotationsOpen"
              >
                Annotations ({{ annotations?.length ?? 0 }})
                <span class="toggle-caret" :class="{ open: annotationsOpen }"
                  >›</span
                >
              </button>
              <ul
                v-if="annotationsOpen && annotations?.length"
                class="annotation-list"
              >
                <li
                  v-for="a in annotations"
                  :key="a.id"
                  class="annotation-item"
                  @click.stop="selectAnnotation(a.id)"
                >
                  <div class="annotation-main">
                    <span class="annotation-body">{{ a.body }}</span>
                    <span class="annotation-meta"
                      >{{ authorLabel(a) }} · {{ shortDate(a.createdAt) }}</span
                    >
                  </div>
                  <button
                    v-if="isAdmin || (user as any)?.id === a.author.id"
                    type="button"
                    class="annotation-delete"
                    :disabled="deletingId === a.id"
                    @click.stop="deleteAnnotation(r.slug, a.id)"
                  >
                    {{ deletingId === a.id ? "…" : "×" }}
                  </button>
                </li>
              </ul>
              <p v-else-if="annotationsOpen" class="annotation-empty">
                No annotations yet.
              </p>
            </div>

            <!-- Request removal -->
            <div
              v-if="loggedIn && !isAdmin"
              class="removal-section"
              @click.stop
            >
              <div v-if="removalSlug === r.slug" class="removal-form">
                <textarea
                  v-model="removalReason"
                  class="removal-textarea"
                  placeholder="Reason (optional)"
                  rows="2"
                  maxlength="500"
                  @click.stop
                />
                <p v-if="removalError" class="removal-error">
                  {{ removalError }}
                </p>
                <div class="removal-actions">
                  <button
                    type="button"
                    class="edit-btn edit-btn-save"
                    :disabled="removalLoading"
                    @click.stop="submitRemoval(r.slug)"
                  >
                    {{ removalLoading ? "…" : "Send" }}
                  </button>
                  <button
                    type="button"
                    class="edit-btn edit-btn-cancel"
                    @click.stop="
                      removalSlug = null;
                      removalReason = '';
                      removalError = '';
                    "
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <button
                v-else
                type="button"
                class="edit-link removal-link"
                @click.stop="
                  removalSlug = r.slug;
                  removalError = '';
                "
              >
                Request removal
              </button>
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: Arial, Helvetica, sans-serif;
  container-type: inline-size;
}
.thead {
  display: grid;
  grid-template-columns: 118px 203px 1fr;
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
.tbody {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 auto;
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
  grid-template-columns: 118px 203px 1fr;
  gap: 12px;
  padding: 8px 24px;
  font-size: 16px;
  align-items: start;
  min-height: 20px;
}
.descriptors-section {
  margin-top: 16px;
}
.descriptor-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fff;
  color: #000;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.2;
  border: 1px solid #000;
  border-radius: 3px;
  font-family: inherit;
}
.row-chip {
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.row-chip.active {
  background: #000;
  color: #fff;
}
.row-chip:hover:not(.active) {
  background: #f0f0f0;
}
.row-chip.active:hover {
  background: #333;
}
.row.selected {
  background: #fff;
}
.row-expanded {
  padding: 8px 24px 20px;
}

/* Read view */
.desc-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.label {
  font-size: 14px;
  margin-bottom: 8px;
}
.desc-text {
  margin: 0;
  color: #000;
  font-size: 16px;
  line-height: 1.35;
}
.edit-link {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #b3b3b3;
  cursor: pointer;
  flex-shrink: 0;
}
.edit-link:hover {
  color: #000;
}

/* Annotations */
.annotations-section {
  margin-top: 16px;
}
.annotations-toggle {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 0;
}
.annotations-toggle:hover {
  color: #555;
}
.toggle-caret {
  display: inline-block;
  font-size: 12px;
  transition: transform 0.15s;
  transform: rotate(0deg);
}
.toggle-caret.open {
  transform: rotate(90deg);
}
.annotation-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.annotation-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #e8e8e8;
  cursor: pointer;
}
.annotation-item:hover {
  background: #f9f9f9;
}
.annotation-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.annotation-body {
  font-size: 14px;
  color: #000;
  line-height: 1.3;
}
.annotation-meta {
  font-size: 12px;
  color: #999;
}
.annotation-delete {
  background: transparent;
  border: 0;
  padding: 0 4px;
  font: inherit;
  font-size: 16px;
  color: #999;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}
.annotation-delete:hover:not(:disabled) {
  color: #c33;
}
.annotation-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.annotation-empty {
  margin: 4px 0 0;
  font-size: 13px;
  color: #999;
}

/* Removal request */
.removal-section {
  margin-top: 12px;
}
.removal-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.removal-textarea {
  border: 1px solid #000;
  padding: 6px;
  font: inherit;
  font-size: 13px;
  resize: vertical;
  background: transparent;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.removal-error {
  margin: 0;
  font-size: 12px;
  color: #c33;
}
.removal-actions {
  display: flex;
  gap: 8px;
}
.removal-link {
  color: #999;
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
}
.edit-btn {
  background: transparent;
  border: 1px solid #000;
  padding: 4px 16px;
  font: inherit;
  font-size: 14px;
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
    grid-template-columns: 84px 1fr 1fr;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
  }
  .th {
    font-size: 12px;
  }
  .row-main {
    grid-template-columns: 84px 1fr 1fr;
    gap: 8px;
    padding: 6px 12px;
    font-size: 12px;
  }
  .desc-text {
    font-size: 12px;
  }
  .label {
    font-size: 12px;
  }
  .annotation-body {
    font-size: 12px;
  }
  .annotations-toggle {
    font-size: 12px;
  }
}

@container (max-width: 400px) {
  .thead {
    grid-template-columns: 72px 1fr 1fr;
    gap: 6px;
    padding: 8px 10px;
  }
  .row-main {
    grid-template-columns: 72px 1fr 1fr;
    gap: 6px;
    padding: 6px 10px;
  }
  .row-expanded {
    padding: 6px 10px 14px;
  }
}
</style>
