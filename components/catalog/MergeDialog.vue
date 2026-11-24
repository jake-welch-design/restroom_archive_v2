<script setup lang="ts">
/**
 * Merging one catalog entry into another, so the other gains its archive dates.
 *
 * Three steps on one screen: pick the entry to merge into, choose which of
 * the two entries' tags the merged one keeps, and settle where its pin goes.
 * The tags and coordinates are written to every scan of the merged entry; see
 * server/api/admin/restrooms/[id]/merge.post.ts.
 *
 * A native <dialog>, for the reasons LegalDialog gives: focus trap, Escape and
 * an inert background for free. It is rendered outside the edit form's <form>,
 * so Enter in the search field cannot submit the edit underneath.
 */
import type { RestroomSummary } from "~/types/restroom";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";
import { groupEntries } from "~~/shared/utils/versions";

const props = defineProps<{
  open: boolean;
  /** The scan being edited. Its whole entry is what merges. */
  entry: RestroomSummary;
}>();

const emit = defineEmits<{ close: []; merged: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);

function syncDialog(open: boolean) {
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) {
    reset();
    el.showModal();
  } else if (!open && el.open) el.close();
}

onMounted(() => syncDialog(props.open));
watch(() => props.open, syncDialog);

function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) emit("close");
}

const { data } = useRestrooms();

const entries = computed(() =>
  groupEntries((data.value ?? []).filter((r) => r.status === "published")),
);

/** Every scan of the entry being merged, oldest first. */
const sourceScans = computed(
  () => entries.value.get(props.entry.establishment) ?? [props.entry],
);

// --- Step 1: the entry to merge into ----------------------------------------

const query = ref("");
const targetKey = ref<string | null>(null);

const candidates = computed(() => {
  const q = query.value.trim().toLowerCase();
  const out: { key: string; latest: RestroomSummary; dates: string[] }[] = [];
  for (const [key, scans] of entries.value) {
    if (key === props.entry.establishment) continue;
    const latest = scans[scans.length - 1];
    if (
      q &&
      !latest.name.toLowerCase().includes(q) &&
      !latest.location.toLowerCase().includes(q)
    )
      continue;
    out.push({
      key,
      latest,
      dates: scans.map((s) => formatDayMonthYear(s.isoDate)).reverse(),
    });
  }
  // Same name first: a duplicate is nearly always spelled the same, and
  // putting those at the top means the right one is usually already in view.
  const name = props.entry.name.trim().toLowerCase();
  return out.sort(
    (a, b) =>
      Number(b.latest.name.trim().toLowerCase() === name) -
        Number(a.latest.name.trim().toLowerCase() === name) ||
      a.latest.name.localeCompare(b.latest.name),
  );
});

const targetScans = computed(() =>
  targetKey.value ? (entries.value.get(targetKey.value) ?? []) : [],
);
const target = computed(() => targetScans.value.at(-1) ?? null);

// --- Step 2: tags -------------------------------------------------------------

/** Every tag either entry carries, case-folded so "Dim" and "dim" are one. */
const allTags = computed(() => {
  const seen = new Map<string, string>();
  for (const s of [...sourceScans.value, ...targetScans.value]) {
    for (const t of s.descriptors ?? []) {
      const k = t.trim().toLowerCase();
      if (k && !seen.has(k)) seen.set(k, t.trim());
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
});

const keptTags = ref<Set<string>>(new Set());

// Everything kept by default: a merge that silently dropped tags would be the
// surprising one. Reset whenever the target changes, since the list does.
watch(allTags, (tags) => {
  keptTags.value = new Set(tags);
});

function toggleTag(t: string) {
  const next = new Set(keptTags.value);
  if (next.has(t)) next.delete(t);
  else next.add(t);
  keptTags.value = next;
}

// --- Step 3: coordinates ------------------------------------------------------

type CoordChoice = "this" | "target" | "custom";
const coordChoice = ref<CoordChoice>("target");
const customLat = ref("");
const customLng = ref("");

function hasCoords(r: { lat: number | null; lng: number | null } | null) {
  return !!r && r.lat != null && r.lng != null;
}

function fmt(r: { lat: number | null; lng: number | null }) {
  return `${r.lat!.toFixed(6)}, ${r.lng!.toFixed(6)}`;
}

/** Metres between two points, to say whether the pins disagree at all. */
const distance = computed(() => {
  const a = props.entry;
  const b = target.value;
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const rad = Math.PI / 180;
  const dLat = (b!.lat! - a.lat!) * rad;
  const dLng = (b!.lng! - a.lng!) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat! * rad) * Math.cos(b!.lat! * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
});

const distanceText = computed(() => {
  const d = distance.value;
  if (d == null) return "";
  if (d < 1) return "The two pins are in the same place.";
  return d < 1000
    ? `The two pins are ${Math.round(d)} m apart.`
    : `The two pins are ${(d / 1000).toFixed(1)} km apart.`;
});

// Prefer the entry being merged into, the established record; fall back to
// whichever side has a pin at all.
watch(target, (t) => {
  if (hasCoords(t)) coordChoice.value = "target";
  else if (hasCoords(props.entry)) coordChoice.value = "this";
  else coordChoice.value = "custom";
});

const chosenCoords = computed<{ lat: number | null; lng: number | null }>(
  () => {
    if (coordChoice.value === "this")
      return { lat: props.entry.lat, lng: props.entry.lng };
    if (coordChoice.value === "target" && target.value)
      return { lat: target.value.lat, lng: target.value.lng };
    const lat = customLat.value.trim();
    const lng = customLng.value.trim();
    if (!lat && !lng) return { lat: null, lng: null };
    return { lat: Number(lat), lng: Number(lng) };
  },
);

const coordsValid = computed(() => {
  const { lat, lng } = chosenCoords.value;
  if (lat == null && lng == null) return true;
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
});

// --- Submit -------------------------------------------------------------------

const loading = ref(false);
const error = ref("");

function reset() {
  query.value = "";
  targetKey.value = null;
  customLat.value = "";
  customLng.value = "";
  error.value = "";
}

const mergedDates = computed(() =>
  [...sourceScans.value, ...targetScans.value]
    .map((s) => s.isoDate)
    .sort()
    .reverse()
    .map(formatDayMonthYear),
);

async function merge() {
  if (!targetKey.value || !coordsValid.value) return;
  loading.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/restrooms/${props.entry.id}/merge`, {
      method: "POST",
      body: {
        into: targetKey.value,
        descriptors: allTags.value.filter((t) => keptTags.value.has(t)),
        ...chosenCoords.value,
      },
    });
    // Emitted before the refresh, not after: the refresh reshapes the list,
    // which can unmount the edit form holding this dialog, and an emit from an
    // unmounted component goes nowhere, leaving the form open on stale data.
    emit("merged");
    await refreshNuxtData("restrooms");
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string } };
    error.value = e.data?.statusMessage ?? "Merge failed.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="merge-dialog"
    aria-labelledby="merge-title"
    @close="emit('close')"
    @click="onBackdrop"
  >
    <div class="merge-head">
      <h2 id="merge-title">Merge “{{ entry.name }}”</h2>
      <button
        type="button"
        class="merge-close"
        aria-label="Close"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <div class="merge-body thin-scroll">
      <section>
        <h3>1. Merge into</h3>
        <input
          v-model="query"
          type="search"
          class="merge-search"
          placeholder="Search by name or location"
          aria-label="Search entries"
        />
        <ul class="merge-list thin-scroll" role="listbox" aria-label="Entries">
          <li v-for="c in candidates" :key="c.key">
            <button
              type="button"
              class="merge-option"
              role="option"
              :aria-selected="c.key === targetKey"
              :class="{ active: c.key === targetKey }"
              @click="targetKey = c.key"
            >
              <span class="opt-name">{{ c.latest.name }}</span>
              <span class="opt-meta">
                {{ c.latest.location }} · {{ c.dates.join(", ") }}
              </span>
            </button>
          </li>
          <li v-if="!candidates.length" class="merge-empty">
            No entries match.
          </li>
        </ul>
      </section>

      <template v-if="target">
        <section>
          <h3>2. Tags</h3>
          <p class="merge-note">
            The merged entry keeps the tags left selected.
          </p>
          <div v-if="allTags.length" class="merge-chips">
            <button
              v-for="t in allTags"
              :key="t"
              type="button"
              class="merge-chip"
              :class="{ active: keptTags.has(t) }"
              :aria-pressed="keptTags.has(t)"
              @click="toggleTag(t)"
            >
              {{ t }}
            </button>
          </div>
          <p v-else class="merge-note">Neither entry has tags.</p>
        </section>

        <section>
          <h3>3. Coordinates</h3>
          <p v-if="distanceText" class="merge-note">{{ distanceText }}</p>
          <div class="merge-coords">
            <label :class="{ disabled: !hasCoords(entry) }">
              <input
                v-model="coordChoice"
                type="radio"
                value="this"
                :disabled="!hasCoords(entry)"
              />
              <span>
                This entry’s
                <span class="coord-val">{{
                  hasCoords(entry) ? fmt(entry) : "none"
                }}</span>
              </span>
            </label>
            <label :class="{ disabled: !hasCoords(target) }">
              <input
                v-model="coordChoice"
                type="radio"
                value="target"
                :disabled="!hasCoords(target)"
              />
              <span>
                {{ target.name }}’s
                <span class="coord-val">{{
                  hasCoords(target) ? fmt(target) : "none"
                }}</span>
              </span>
            </label>
            <label>
              <input v-model="coordChoice" type="radio" value="custom" />
              <span>Other</span>
            </label>
            <div v-if="coordChoice === 'custom'" class="merge-custom">
              <input
                v-model="customLat"
                type="number"
                step="any"
                placeholder="Lat"
                aria-label="Latitude"
              />
              <input
                v-model="customLng"
                type="number"
                step="any"
                placeholder="Lng"
                aria-label="Longitude"
              />
            </div>
          </div>
        </section>

        <p class="merge-summary">
          {{ target.name }} will have {{ mergedDates.length }} archive dates:
          {{ mergedDates.join(", ") }}. The most recent shows by default.
        </p>
      </template>

      <p v-if="error" class="merge-error">{{ error }}</p>
    </div>

    <div class="merge-actions">
      <button type="button" class="link-btn" @click="emit('close')">
        Cancel
      </button>
      <button
        type="button"
        class="primary-btn"
        :disabled="!target || !coordsValid || loading"
        @click="merge"
      >
        {{ loading ? "Merging…" : "Merge" }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.merge-dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: min(85vh, 760px);
  padding: 0;
  border: 1px solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  overflow: hidden;
}

/* On [open] only; see LegalDialog for why `display` must not be set on the
   bare selector. */
.merge-dialog[open] {
  display: flex;
  flex-direction: column;
}

.merge-dialog::backdrop {
  background: rgb(0 0 0 / 0.35);
}

.merge-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line-soft);
}

.merge-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
}

.merge-close {
  border: none;
  background: none;
  padding: 0 4px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--ink);
}

.merge-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.merge-body section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merge-body h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.merge-search {
  border: 0;
  border-bottom: 1px solid var(--ink);
  padding: 4px 0;
  font: inherit;
  outline: none;
  background: transparent;
}

.merge-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--line-faint);
}

.merge-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--surface);
  padding: 6px 8px;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
}

.merge-option:hover:not(.active) {
  background: var(--canvas);
}

.merge-option.active {
  background: var(--ink);
  color: var(--paper);
}

.opt-meta {
  font-size: 12px;
  color: var(--muted);
}

.merge-option.active .opt-meta {
  color: var(--line);
}

.merge-empty {
  padding: 8px;
  color: var(--muted);
}

.merge-note {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

/* The catalog filter's chips: selected is filled. */
.merge-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.merge-chip {
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--ink);
  border-radius: 3px;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}

.merge-chip.active {
  background: var(--ink);
  color: var(--paper);
}

.merge-coords {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.merge-coords label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
}

.merge-coords label.disabled {
  color: var(--faint);
  cursor: default;
}

.coord-val {
  margin-left: 4px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.merge-custom {
  display: flex;
  gap: 10px;
  padding-left: 22px;
}

.merge-custom input {
  width: 140px;
  border: 0;
  border-bottom: 1px solid var(--ink);
  padding: 3px 0;
  font: inherit;
  outline: none;
  background: transparent;
}

.merge-summary {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--line-faint);
}

.merge-error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.merge-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--line-soft);
}

/* iOS zooms into focused fields under 16px. */
@media (max-width: 750px) {
  .merge-search,
  .merge-custom input {
    font-size: 16px;
  }
}
</style>
