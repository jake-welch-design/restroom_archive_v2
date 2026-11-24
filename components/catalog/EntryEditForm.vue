<script setup lang="ts">
/**
 * The catalog entry editor.
 *
 * Inline in the expanded row on a wide screen. On a phone it opens full screen
 * in a native <dialog>, because the row is too cramped to work in: the panel is
 * a sheet over the viewer, and the keyboard takes most of what is left. Same
 * form either way, so the two cannot drift. The dialog shell is the one
 * LegalDialog uses, for the same reasons (focus trap, Escape, inert background).
 *
 * Save and Cancel sit in the sheet's header rather than below the form, so they
 * stay on screen while the keyboard is up.
 */
import type { RestroomSummary } from "~/types/restroom";
import {
  COUNTRIES,
  cityFromLocation,
  composeLocation,
  subdivisionFromLocation,
  subdivisionsFor,
} from "~~/shared/utils/regions";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";

const props = defineProps<{
  entry: RestroomSummary;
  /** Open full screen rather than inline. */
  fullscreen: boolean;
  suggestions: string[];
}>();

const emit = defineEmits<{ close: [] }>();

const { entry } = props;

const form = reactive({
  name: entry.name,
  city: cityFromLocation(entry.location),
  country: entry.country ?? "",
  // The trailing token is only a subdivision where the country collects one.
  // On a row with no country yet it stays blank and the admin picks both,
  // which is the point of opening the editor on an unassigned entry.
  subdivision:
    entry.country && subdivisionsFor(entry.country)
      ? subdivisionFromLocation(entry.location)
      : "",
  isoDate: entry.isoDate,
  lat: entry.lat != null ? String(entry.lat) : "",
  lng: entry.lng != null ? String(entry.lng) : "",
  description: entry.description ?? "",
  descriptors: [...(entry.descriptors ?? [])],
});

// Merging is an admin decision: which place a scan belongs to is the
// archive's call, not the submitter's, and the endpoints behind it are
// admin-only.
const { isAdmin } = useAuth();
const { data: allRestrooms } = useRestrooms();

/** This scan's entry's archive dates, newest first. */
const entryDates = computed(() =>
  (allRestrooms.value ?? [])
    .filter(
      (r) =>
        r.status === "published" && r.establishment === entry.establishment,
    )
    .map((r) => r.isoDate)
    .sort()
    .reverse(),
);

const combined = computed(() => entryDates.value.length > 1);
const mergeOpen = ref(false);
const separating = ref(false);

// Both change data the form was opened with (a merge rewrites the entry's tags
// and coordinates), so the form closes rather than offering stale fields.
function onMerged() {
  mergeOpen.value = false;
  emit("close");
}

async function separate() {
  if (
    !window.confirm(
      `Separate the ${formatDayMonthYear(entry.isoDate)} scan into an entry of its own?`,
    )
  )
    return;
  separating.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/restrooms/${entry.id}/separate`, {
      method: "POST",
    });
    // Closed before the refresh, which can unmount this form; see MergeDialog.
    emit("close");
    await refreshNuxtData("restrooms");
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string } };
    error.value = e.data?.statusMessage ?? "Separate failed.";
  } finally {
    separating.value = false;
  }
}

// Mirrors the submission wizard: the row's `location` is composed from these
// picks rather than typed, so an edit cannot leave the display string and the
// stored country disagreeing.
const subdivisions = computed(() => subdivisionsFor(form.country));

watch(
  () => form.country,
  (next, prev) => {
    if (prev !== "" && next !== prev) form.subdivision = "";
  },
);

const location = computed(() =>
  form.city.trim() && form.country
    ? composeLocation(form.city, form.country, form.subdivision)
    : "",
);

const valid = computed(
  () => !!location.value && (!subdivisions.value || !!form.subdivision),
);
const loading = ref(false);
const error = ref("");

async function save() {
  loading.value = true;
  error.value = "";
  try {
    await $fetch(`/api/restrooms/${entry.slug}`, {
      method: "PATCH",
      body: {
        name: form.name,
        location: location.value,
        country: form.country,
        isoDate: form.isoDate,
        lat: form.lat !== "" ? Number(form.lat) : null,
        lng: form.lng !== "" ? Number(form.lng) : null,
        description: form.description || null,
        descriptors: form.descriptors,
      },
    });
    emit("close");
    await refreshNuxtData("restrooms");
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string } };
    error.value = e.data?.statusMessage ?? "Save failed.";
  } finally {
    loading.value = false;
  }
}

const root = ref<HTMLDialogElement | null>(null);

onMounted(() => {
  if (props.fullscreen) root.value?.showModal();
});
</script>

<template>
  <component
    :is="fullscreen ? 'dialog' : 'div'"
    ref="root"
    :class="fullscreen ? 'edit-sheet' : 'edit-inline'"
    :aria-labelledby="fullscreen ? `edit-title-${entry.slug}` : undefined"
    @close="emit('close')"
    @click.stop
  >
    <form class="edit-form" @submit.prevent="save">
      <header v-if="fullscreen" class="edit-sheet-head">
        <button type="button" class="link-btn" @click="emit('close')">
          Cancel
        </button>
        <h2 :id="`edit-title-${entry.slug}`" class="edit-sheet-title">
          Edit entry
        </h2>
        <button
          type="submit"
          class="primary-btn edit-sheet-save"
          :disabled="loading || !valid"
        >
          {{ loading ? "Saving…" : "Save" }}
        </button>
      </header>

      <div class="edit-body">
        <p v-if="fullscreen && error" class="edit-error">{{ error }}</p>

        <div class="edit-grid">
          <label class="edit-field">
            <span class="edit-label">Name</span>
            <input
              v-model="form.name"
              type="text"
              required
              class="edit-input"
            />
          </label>
          <label class="edit-field">
            <span class="edit-label">City</span>
            <input
              v-model="form.city"
              type="text"
              required
              class="edit-input"
            />
          </label>
          <label class="edit-field">
            <span class="edit-label">Country</span>
            <select v-model="form.country" required class="edit-input">
              <option value="" disabled>Select a country</option>
              <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">
                {{ c.name }}
              </option>
            </select>
          </label>
          <label v-if="subdivisions" class="edit-field">
            <span class="edit-label">
              {{ form.country === "CA" ? "Province" : "State" }}
            </span>
            <select v-model="form.subdivision" required class="edit-input">
              <option value="" disabled>Select</option>
              <option
                v-for="sub in subdivisions"
                :key="sub.code"
                :value="sub.code"
              >
                {{ sub.name }}
              </option>
            </select>
          </label>
          <p v-if="location" class="edit-location-preview">
            Listed as "{{ location }}"
          </p>
          <label class="edit-field">
            <span class="edit-label">Date</span>
            <input
              v-model="form.isoDate"
              type="date"
              required
              class="edit-input"
            />
          </label>
          <div class="edit-field-row">
            <label class="edit-field">
              <span class="edit-label">Lat</span>
              <input
                v-model="form.lat"
                type="number"
                step="any"
                class="edit-input"
              />
            </label>
            <label class="edit-field">
              <span class="edit-label">Lng</span>
              <input
                v-model="form.lng"
                type="number"
                step="any"
                class="edit-input"
              />
            </label>
          </div>
          <label class="edit-field edit-field-full">
            <span class="edit-label">Description</span>
            <textarea
              v-model="form.description"
              class="edit-input edit-textarea"
              maxlength="1000"
              :rows="fullscreen ? 6 : 3"
            />
          </label>
          <div class="edit-field edit-field-full">
            <span class="edit-label">Descriptors</span>
            <TagInput v-model="form.descriptors" :suggestions="suggestions" />
          </div>
          <!-- Admin only: which entry this scan is part of. Merging and
               separating save straight away, separately from Save below. -->
          <div v-if="isAdmin" class="edit-field edit-field-full">
            <span class="edit-label">Archive dates</span>
            <div class="merge-row">
              <span class="merge-status">
                {{
                  combined
                    ? entryDates.map(formatDayMonthYear).join(", ")
                    : "Only this date"
                }}
              </span>
              <button type="button" class="edit-btn" @click="mergeOpen = true">
                Merge…
              </button>
              <button
                v-if="combined"
                type="button"
                class="edit-btn"
                :disabled="separating"
                @click="separate"
              >
                {{ separating ? "Separating…" : "Separate" }}
              </button>
            </div>
          </div>
        </div>

        <template v-if="!fullscreen">
          <p v-if="error" class="edit-error">{{ error }}</p>
          <div class="edit-actions">
            <button
              type="submit"
              class="edit-btn edit-btn-save"
              :disabled="loading || !valid"
            >
              {{ loading ? "Saving…" : "Save" }}
            </button>
            <button
              type="button"
              class="edit-btn edit-btn-cancel"
              @click="emit('close')"
            >
              Cancel
            </button>
          </div>
        </template>
      </div>
    </form>

    <!-- Outside the <form>, so Enter in the dialog's search cannot submit
         the edit. -->
    <LazyMergeDialog
      v-if="isAdmin && mergeOpen"
      :open="mergeOpen"
      :entry="entry"
      @close="mergeOpen = false"
      @merged="onMerged"
    />
  </component>
</template>

<style scoped>
/* The section rule, matching `.description` in the read view it replaces. */
.edit-inline {
  border-top: 1px solid var(--line-faint);
  padding-top: 12px;
}

.edit-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  /* Bottom-aligned, so fields in a row share an underline even when a platform
     draws one of them taller. iOS does that to the date field beside Lat/Lng. */
  align-items: end;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
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
  color: var(--muted);
}

.edit-input {
  /* Underline-only on every platform. iOS otherwise keeps its own rounded,
     taller chrome on date and number fields. */
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  border: 0;
  border-bottom: 1px solid var(--ink);
  border-radius: 0;
  padding: 3px 0;
  font: inherit;
  font-size: 14px;
  background: transparent;
  outline: none;
  color: var(--ink);
  width: 100%;
  min-width: 0;
  /* One height for every kind of field, so labels line up across a row and an
     empty date, which iOS collapses, keeps its place. */
  min-height: 26px;
}

/* iOS centres a date's value. */
.edit-input[type="date"]::-webkit-date-and-time-value {
  text-align: left;
}

/* Underline-only fields, so the selects drop their native chrome to match and
   carry a drawn caret instead. */
select.edit-input {
  padding-right: 16px;
  background-image: var(--select-caret);
  background-repeat: no-repeat;
  background-position: right 1px center;
  cursor: pointer;
}

/* The composed display string, shown back so an edit that changes a pick shows
   what the catalog row will read as. Spans the grid: it describes the fields
   above it rather than sitting beside one of them. */
.edit-location-preview {
  grid-column: 1 / -1;
  margin: -2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.merge-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-height: 26px;
}

.merge-status {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
}

.edit-textarea {
  border: 1px solid var(--ink);
  padding: 4px 6px;
  resize: vertical;
}

.edit-error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}

.edit-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.edit-btn {
  background: transparent;
  border: 1px solid var(--ink);
  padding: 3px 10px;
  font: inherit;
  /* Matches `.edit-label` on the fields above it. */
  font-size: 12px;
  /* Set outright: a button does not inherit colour, and iOS's default is pale
     enough to vanish, most of all on a disabled Save. */
  color: var(--ink);
  cursor: pointer;
}

.edit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Hover only where there is a pointer: a tap on iOS leaves it stuck on. */
@media (hover: hover) {
  .edit-btn-save:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }
  .edit-btn-cancel:hover {
    background: var(--canvas);
  }
}

/* --- Full screen ------------------------------------------------------------ */

.edit-sheet {
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--paper);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  line-height: 1.4;
}

/* Stays put as the form scrolls, so Save is never further than a tap away. */
.edit-sheet-head {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  background: var(--paper);
  border-bottom: 1px solid var(--ink);
}

.edit-sheet-head .link-btn {
  justify-self: start;
  padding-left: 0;
}

.edit-sheet-title {
  margin: 0;
  font-size: 15px;
  font-weight: 400;
}

.edit-sheet-save {
  justify-self: end;
  padding: 6px 16px;
}

.edit-sheet .edit-body {
  gap: 20px;
  /* The bottom room is for the descriptor suggestions, which open downward from
     the last field and would otherwise have nowhere to scroll to. */
  padding: 20px 16px calc(220px + env(safe-area-inset-bottom, 0px));
}

/* One column with room between: the fields are the only thing on screen now. */
.edit-sheet .edit-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.edit-sheet .edit-field-row {
  gap: 16px;
}

.edit-sheet .edit-field {
  gap: 6px;
}

.edit-sheet .edit-input {
  padding: 8px 0;
  min-height: 40px;
}

.edit-sheet .edit-textarea {
  padding: 8px;
}

.edit-sheet .edit-location-preview {
  margin-top: -12px;
}

/* Responsive steps, same as the list around the inline form. */
@container (max-width: 560px) {
  .edit-input {
    font-size: 12px;
  }
  .edit-error {
    font-size: 12px;
  }
}

/* iOS zooms the page when a field under 16px takes focus, and does not zoom
   back out. Same floor as `.field-input` in forms.css, after the step above. */
@media (max-width: 750px) {
  .edit-input {
    font-size: 16px;
  }
}
</style>
