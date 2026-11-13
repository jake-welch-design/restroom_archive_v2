<script setup lang="ts">
/**
 * The video studio: turntable clips of archive entries, for Instagram.
 *
 * Admin-only, and its own page rather than a section of the Admin tab because
 * it needs a large preview in the export's own shape, which the account page's
 * list panel and the layout's global viewer cannot give it. It keeps the
 * layout's anatomy anyway, a white panel beside a black stage, so it reads as
 * part of the same site.
 *
 * Everything happens in the browser: the stage renders a frame at a time, and
 * studioExport.ts encodes the frames to MP4. Nothing is uploaded.
 *
 * Settings and per-entry adjustments are kept in localStorage, so a batch can
 * be re-run later from the same machine with the same framing.
 */
import type { RestroomSummary } from "~/types/restroom";
import type { SortOption } from "~/components/account/admin/AdminListControls.vue";
import {
  RateLimitedError,
  STUDIO_ASPECTS,
  STUDIO_RATIOS,
  STUDIO_VIEWS,
  createTurntableStage,
  type StudioAspect,
  type StudioFrame,
  type StudioOrientation,
  type StudioView,
  type TurntableStage,
} from "~/composables/turntableStage";
import {
  canExport,
  canPickFolder,
  downloadSink,
  encodeTurntable,
  pickFolderSink,
  studioFileName,
  type StudioSink,
} from "~/composables/studioExport";

definePageMeta({ layout: false });
useHead({
  title: "Studio",
  meta: [{ name: "robots", content: "noindex" }],
});

const { isAdmin } = useAuth();
// Awaited so the server renders with the list, and with the entry the preview
// opens on, rather than an empty panel the client then fills in.
const { data: restrooms } = await useRestrooms();

/* --- Settings --------------------------------------------------------------- */

const SECONDS_MIN = 1;
const SECONDS_MAX = 12;
const CAPTION_SIZE_MIN = 10;
const CAPTION_SIZE_MAX = 60;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

interface StudioSettings {
  /**
   * Kept alongside `aspect` because square belongs to both orientations, and
   * turning back from 1:1 should land on the orientation it was chosen in.
   */
  orientation: StudioOrientation;
  aspect: StudioAspect;
  view: StudioView;
  zoom: number;
  seconds: number;
  caption: boolean;
  captionSize: number;
}

/**
 * One entry's departure from the batch: which way it faces at the start, and
 * a zoom on top of the batch's, since scans range from a cubicle to a hall.
 */
interface Adjustment {
  startAngle: number;
  zoom: number;
}

const DEFAULT_SETTINGS: StudioSettings = {
  orientation: "portrait",
  aspect: "9:16",
  view: "three-quarter",
  zoom: 1,
  seconds: 8,
  caption: true,
  captionSize: 22,
};

const SETTINGS_KEY = "studio:settings";
const ADJUSTMENTS_KEY = "studio:adjustments";

const settings = ref<StudioSettings>({ ...DEFAULT_SETTINGS });
const adjustments = ref<Record<string, Adjustment>>({});

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the studio still works, it just forgets.
  }
}

/**
 * Stored settings, kept only where still valid. An earlier version of the
 * studio stored a field it no longer has (a background), and an edited or
 * stale value could otherwise come back out of range.
 */
function restoreSettings(stored: Partial<StudioSettings>): StudioSettings {
  const d = DEFAULT_SETTINGS;
  const orientation =
    stored.orientation && stored.orientation in STUDIO_RATIOS
      ? stored.orientation
      : d.orientation;
  const aspect =
    stored.aspect && STUDIO_RATIOS[orientation].includes(stored.aspect)
      ? stored.aspect
      : STUDIO_RATIOS[orientation][0];
  const seconds = Number(stored.seconds);
  const zoom = Number(stored.zoom);
  const captionSize = Number(stored.captionSize);
  return {
    orientation,
    aspect,
    view: STUDIO_VIEWS.some((v) => v.id === stored.view)
      ? stored.view!
      : d.view,
    zoom: zoom >= ZOOM_MIN && zoom <= ZOOM_MAX ? zoom : d.zoom,
    seconds:
      seconds >= SECONDS_MIN && seconds <= SECONDS_MAX ? seconds : d.seconds,
    caption: typeof stored.caption === "boolean" ? stored.caption : d.caption,
    captionSize:
      captionSize >= CAPTION_SIZE_MIN && captionSize <= CAPTION_SIZE_MAX
        ? captionSize
        : d.captionSize,
  };
}

/** Turns the frame over, carrying the ratio across: 9:16 becomes 16:9. */
function setOrientation(next: StudioOrientation) {
  const s = settings.value;
  if (s.orientation === next) return;
  const index = STUDIO_RATIOS[s.orientation].indexOf(s.aspect);
  settings.value = {
    ...s,
    orientation: next,
    aspect: STUDIO_RATIOS[next][Math.max(index, 0)],
  };
}

onMounted(() => {
  const stored = readStored<Partial<StudioSettings>>(SETTINGS_KEY);
  if (stored) settings.value = restoreSettings(stored);
  adjustments.value =
    readStored<Record<string, Adjustment>>(ADJUSTMENTS_KEY) ?? {};
});
watch(settings, (v) => writeStored(SETTINGS_KEY, v), { deep: true });
watch(adjustments, (v) => writeStored(ADJUSTMENTS_KEY, v), { deep: true });

function adjustmentFor(slug: string): Adjustment {
  return adjustments.value[slug] ?? { startAngle: 0, zoom: 1 };
}

function isAdjusted(slug: string) {
  const a = adjustments.value[slug];
  return !!a && (a.startAngle !== 0 || a.zoom !== 1);
}

function setAdjustment(slug: string, patch: Partial<Adjustment>) {
  const next = { ...adjustmentFor(slug), ...patch };
  // Back at the batch's framing is no adjustment, so the "Adjusted" tag goes.
  const rest = Object.fromEntries(
    Object.entries(adjustments.value).filter(([key]) => key !== slug),
  );
  adjustments.value =
    next.startAngle === 0 && next.zoom === 1 ? rest : { ...rest, [slug]: next };
}

const adjustedCount = computed(() => Object.keys(adjustments.value).length);

/** Puts every entry back on the batch's framing. */
function resetAllAdjustments() {
  const n = adjustedCount.value;
  if (!n) return;
  if (
    !window.confirm(
      `Reset the start angle and zoom of ${n} ${n === 1 ? "restroom" : "restrooms"}?`,
    )
  )
    return;
  adjustments.value = {};
}

function frameFor(entry: RestroomSummary): StudioFrame {
  const s = settings.value;
  const a = adjustmentFor(entry.slug);
  return {
    aspect: s.aspect,
    view: s.view,
    zoom: s.zoom * a.zoom,
    startAngle: a.startAngle,
    caption: s.caption
      ? {
          name: entry.name,
          date: entry.date,
          location: entry.location,
          size: s.captionSize,
        }
      : null,
  };
}

/* --- The checklist ---------------------------------------------------------- */

type SortKey = "name" | "location" | "isoDate";

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "isoDate", label: "Scan date" },
];

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  RestroomSummary,
  SortKey
>({
  source: restrooms,
  searchFields: (e) => [e.name, e.location],
  // Newest first: the latest scans are the ones most likely to be posted.
  defaultKey: "isoDate",
  defaultDir: "desc",
  compare: (a, b, key) => {
    if (key === "location") return a.location.localeCompare(b.location);
    if (key === "isoDate")
      return a.isoDate.localeCompare(b.isoDate) || a.id - b.id;
    return a.name.localeCompare(b.name) || a.id - b.id;
  },
});

const checked = ref<Set<string>>(new Set());

function toggleChecked(slug: string) {
  const next = new Set(checked.value);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  checked.value = next;
}

/** Selects or clears what the search is showing, leaving the rest alone. */
function checkVisible(on: boolean) {
  const next = new Set(checked.value);
  for (const e of visible.value) {
    if (on) next.add(e.slug);
    else next.delete(e.slug);
  }
  checked.value = next;
}

const allVisibleChecked = computed(
  () =>
    visible.value.length > 0 &&
    visible.value.every((e) => checked.value.has(e.slug)),
);

/** The batch, in the order the list shows it, so the export runs top to bottom. */
const batch = computed(() => {
  const order = new Map(visible.value.map((e, i) => [e.slug, i]));
  return (restrooms.value ?? [])
    .filter((e) => checked.value.has(e.slug))
    .sort(
      (a, b) =>
        (order.get(a.slug) ?? Infinity) - (order.get(b.slug) ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
});

/* --- Preview ---------------------------------------------------------------- */

const canvasEl = ref<HTMLCanvasElement | null>(null);
let stage: TurntableStage | null = null;
let raf = 0;
let turnOrigin = 0;

const focusSlug = ref<string | null>(null);
const focus = computed(
  () => restrooms.value?.find((e) => e.slug === focusSlug.value) ?? null,
);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const playing = ref(true);

// Opens on the first entry, so the stage is never empty on arrival.
watch(
  () => restrooms.value?.length,
  () => {
    if (!focusSlug.value && visible.value.length)
      focusSlug.value = visible.value[0].slug;
  },
  { immediate: true },
);

async function loadFocus() {
  const entry = focus.value;
  if (!stage || !entry) return;
  previewLoading.value = true;
  previewError.value = null;
  try {
    await stage.load(entry.modelUrl, entry.crop);
  } catch (e) {
    previewError.value =
      e instanceof RateLimitedError
        ? "Too many scans opened in the last few minutes. Try again shortly."
        : "This scan could not be loaded.";
  } finally {
    previewLoading.value = false;
  }
}

watch(focusSlug, () => {
  turnOrigin = performance.now();
  if (!exporting.value) loadFocus();
});

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  // The exporter drives the stage while it runs; the preview stands aside.
  if (!stage || exporting.value || !focus.value || !stage.hasModel()) return;
  const period = settings.value.seconds * 1000;
  const turn = playing.value ? ((now - turnOrigin) % period) / period : 0;
  stage.render(frameFor(focus.value), turn);
}

function togglePlaying() {
  playing.value = !playing.value;
  turnOrigin = performance.now();
}

/** Setting the start angle shows the start, so the admin can see what faces front. */
function onStartAngle(value: number) {
  if (!focus.value) return;
  playing.value = false;
  setAdjustment(focus.value.slug, { startAngle: value });
}

function onFineZoom(value: number) {
  if (!focus.value) return;
  setAdjustment(focus.value.slug, { zoom: value });
}

/* --- Export ----------------------------------------------------------------- */

const exportSupported = ref(true);
watch(
  () => settings.value.aspect,
  async (aspect) => {
    if (import.meta.client) exportSupported.value = await canExport(aspect);
  },
  { immediate: true },
);

type ResultStatus = "done" | "failed" | "cancelled";
interface ExportResult {
  slug: string;
  name: string;
  status: ResultStatus;
  file?: string;
  error?: string;
}

const exporting = ref(false);
const exportIndex = ref(0);
const exportTotal = ref(0);
const exportProgress = ref(0);
const exportNote = ref<string | null>(null);
const results = ref<ExportResult[]>([]);
const sinkLabel = ref<string | null>(null);
let abort: AbortController | null = null;

/** How long to wait out the scan route's burst limit before trying again. */
const RATE_LIMIT_WAIT_MS = 60_000;
const RATE_LIMIT_TRIES = 6;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

async function loadForExport(entry: RestroomSummary, signal: AbortSignal) {
  for (let attempt = 1; ; attempt++) {
    try {
      await stage!.load(entry.modelUrl, entry.crop, signal);
      return;
    } catch (e) {
      if (!(e instanceof RateLimitedError) || attempt >= RATE_LIMIT_TRIES)
        throw e;
      // The route allows 100 scans in five minutes; a long batch can reach
      // that. Waiting it out is the whole remedy.
      exportNote.value = "Waiting on the scan rate limit…";
      await sleep(RATE_LIMIT_WAIT_MS, signal);
      exportNote.value = null;
    }
  }
}

/**
 * The folder chosen ahead of an export, kept for the rest of the visit so a
 * second batch lands in the same place without asking again. Not stored: a
 * folder handle cannot go in localStorage, and the browser would ask for
 * permission again on the next visit anyway.
 */
const chosenSink = shallowRef<StudioSink | null>(null);

async function chooseFolder() {
  try {
    chosenSink.value = await pickFolderSink();
  } catch {
    // The admin closed the picker; keep whatever was chosen before.
  }
}

async function startExport() {
  if (!stage || exporting.value || !batch.value.length) return;

  // The folder picker has to open straight from the click, before anything
  // else is awaited, or the browser refuses it as not user-initiated.
  let sink: StudioSink = chosenSink.value ?? downloadSink;
  if (!chosenSink.value && canPickFolder()) {
    try {
      sink = await pickFolderSink();
      chosenSink.value = sink;
    } catch {
      return; // The admin closed the picker.
    }
  }

  const entries = [...batch.value];
  abort = new AbortController();
  const { signal } = abort;
  exporting.value = true;
  exportTotal.value = entries.length;
  results.value = [];
  sinkLabel.value = sink.label;

  for (const [i, entry] of entries.entries()) {
    exportIndex.value = i;
    exportProgress.value = 0;
    exportNote.value = null;
    if (signal.aborted) {
      results.value.push({
        slug: entry.slug,
        name: entry.name,
        status: "cancelled",
      });
      continue;
    }
    try {
      await loadForExport(entry, signal);
      const frame = frameFor(entry);
      const blob = await encodeTurntable(stage, canvasEl.value!, frame, {
        seconds: settings.value.seconds,
        signal,
        onProgress: (p) => (exportProgress.value = p),
      });
      const file = studioFileName(entry.slug, frame);
      await sink.save(file, blob);
      results.value.push({
        slug: entry.slug,
        name: entry.name,
        status: "done",
        file,
      });
    } catch (e) {
      const cancelled = (e as Error).name === "AbortError";
      results.value.push({
        slug: entry.slug,
        name: entry.name,
        status: cancelled ? "cancelled" : "failed",
        error: cancelled ? undefined : (e as Error).message,
      });
    }
  }

  exporting.value = false;
  exportNote.value = null;
  abort = null;
  // The stage holds the last entry exported; put the preview back.
  turnOrigin = performance.now();
  await loadFocus();
}

function cancelExport() {
  abort?.abort();
}

const doneCount = computed(
  () => results.value.filter((r) => r.status === "done").length,
);
const failed = computed(() =>
  results.value.filter((r) => r.status === "failed"),
);

const exportingName = computed(() =>
  exporting.value ? batch.value[exportIndex.value]?.name : null,
);

/* --- Lifecycle -------------------------------------------------------------- */

watch(
  canvasEl,
  (canvas) => {
    if (!canvas || stage) return;
    stage = createTurntableStage(canvas);
    turnOrigin = performance.now();
    raf = requestAnimationFrame(tick);
    loadFocus();
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  abort?.abort();
  cancelAnimationFrame(raf);
  stage?.dispose();
  stage = null;
});

// A batch in progress would be lost with the page.
onBeforeRouteLeave(() => {
  if (exporting.value && !window.confirm("Stop the export and leave?"))
    return false;
});

/** Width over height, which sizes the preview frame to the export's shape. */
const ratio = computed(() => {
  const { width, height } = STUDIO_ASPECTS[settings.value.aspect];
  return String(width / height);
});

// Read after mount: the server has no window, and answering there would
// render a different hint than the client hydrates.
const folderAccess = ref(false);
onMounted(() => (folderAccess.value = canPickFolder()));

const zoomPercent = computed(() => Math.round(settings.value.zoom * 100));
</script>

<template>
  <div class="studio-shell">
    <aside class="studio-panel">
      <CatalogHeader />

      <div v-if="!isAdmin" class="studio-body">
        <p class="empty">The studio is for admins.</p>
      </div>

      <template v-else>
        <div class="studio-body thin-scroll">
          <header class="studio-head">
            <h1 class="studio-title">Video studio</h1>
            <NuxtLink to="/account?tab=admin" class="link-btn">
              Back to admin
            </NuxtLink>
          </header>

          <!-- Batch settings: what every clip in the export shares. -->
          <section class="settings-list" aria-label="Video settings">
            <div class="settings-row">
              <span class="settings-label">Format</span>
              <div class="seg-pair">
                <div class="seg" role="radiogroup" aria-label="Orientation">
                  <button
                    v-for="o in ['portrait', 'landscape'] as const"
                    :key="o"
                    type="button"
                    class="seg-btn"
                    role="radio"
                    :aria-checked="settings.orientation === o"
                    :class="{ active: settings.orientation === o }"
                    :disabled="exporting"
                    @click="setOrientation(o)"
                  >
                    {{ o === "portrait" ? "Portrait" : "Landscape" }}
                  </button>
                </div>
                <div class="seg" role="radiogroup" aria-label="Ratio">
                  <button
                    v-for="id in STUDIO_RATIOS[settings.orientation]"
                    :key="id"
                    type="button"
                    class="seg-btn"
                    role="radio"
                    :aria-checked="settings.aspect === id"
                    :class="{ active: settings.aspect === id }"
                    :disabled="exporting"
                    @click="settings.aspect = id"
                  >
                    {{ STUDIO_ASPECTS[id].label }}
                  </button>
                </div>
              </div>
              <span class="settings-note">
                {{ STUDIO_ASPECTS[settings.aspect].hint }} ·
                {{ STUDIO_ASPECTS[settings.aspect].width }}×{{
                  STUDIO_ASPECTS[settings.aspect].height
                }}
              </span>
            </div>

            <div class="settings-row">
              <span class="settings-label">View</span>
              <div class="seg" role="radiogroup" aria-label="View">
                <button
                  v-for="v in STUDIO_VIEWS"
                  :key="v.id"
                  type="button"
                  class="seg-btn"
                  role="radio"
                  :aria-checked="settings.view === v.id"
                  :class="{ active: settings.view === v.id }"
                  :disabled="exporting"
                  @click="settings.view = v.id"
                >
                  {{ v.label }}
                </button>
              </div>
              <span v-if="settings.view === 'inside'" class="settings-note">
                Turns on the spot from where POV stands.
              </span>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="studio-zoom">Zoom</label>
              <div class="range-row">
                <input
                  id="studio-zoom"
                  v-model.number="settings.zoom"
                  class="range"
                  type="range"
                  :min="ZOOM_MIN"
                  :max="ZOOM_MAX"
                  step="0.05"
                  :disabled="exporting"
                />
                <span class="range-value">{{ zoomPercent }}%</span>
                <button
                  v-if="settings.zoom !== 1"
                  type="button"
                  class="link-btn"
                  :disabled="exporting"
                  @click="settings.zoom = 1"
                >
                  Reset
                </button>
              </div>
              <span class="settings-note">
                {{
                  settings.view === "inside"
                    ? "100% is the viewer's POV field of view."
                    : "100% draws every scan at the same scale, fitting a 4 × 4 m room."
                }}
              </span>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="studio-length">
                Length of one turn
              </label>
              <div class="range-row">
                <input
                  id="studio-length"
                  v-model.number="settings.seconds"
                  class="range"
                  type="range"
                  :min="SECONDS_MIN"
                  :max="SECONDS_MAX"
                  step="1"
                  :disabled="exporting"
                />
                <span class="range-value">{{ settings.seconds }}s</span>
              </div>
            </div>

            <div class="settings-row">
              <span class="settings-label">Caption</span>
              <div class="seg" role="radiogroup" aria-label="Caption">
                <button
                  type="button"
                  class="seg-btn"
                  role="radio"
                  :aria-checked="settings.caption"
                  :class="{ active: settings.caption }"
                  :disabled="exporting"
                  @click="settings.caption = true"
                >
                  On
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  role="radio"
                  :aria-checked="!settings.caption"
                  :class="{ active: !settings.caption }"
                  :disabled="exporting"
                  @click="settings.caption = false"
                >
                  Off
                </button>
              </div>
              <span class="settings-note">Name, date and location.</span>
            </div>

            <div v-if="settings.caption" class="settings-row">
              <label class="settings-label" for="studio-caption-size">
                Text size
              </label>
              <div class="range-row">
                <input
                  id="studio-caption-size"
                  v-model.number="settings.captionSize"
                  class="range"
                  type="range"
                  :min="CAPTION_SIZE_MIN"
                  :max="CAPTION_SIZE_MAX"
                  step="1"
                  :disabled="exporting"
                />
                <span class="range-value">{{ settings.captionSize }}</span>
              </div>
            </div>
          </section>

          <!-- The batch. -->
          <section class="studio-list" aria-label="Restrooms">
            <div class="list-head">
              <span class="settings-group-label">Restrooms</span>
              <span class="list-count">
                {{ checked.size }} of {{ restrooms?.length ?? 0 }} selected
              </span>
            </div>

            <AdminListControls
              v-model:query="query"
              v-model:sort-key="sortKey"
              v-model:sort-dir="sortDir"
              :sort-options="SORT_OPTIONS"
              search-label="Search restrooms"
              id-prefix="studio"
            >
              <template #below>
                <div class="inline-actions">
                  <button
                    type="button"
                    class="link-btn"
                    :disabled="exporting"
                    @click="checkVisible(!allVisibleChecked)"
                  >
                    {{
                      allVisibleChecked
                        ? query
                          ? "Clear these"
                          : "Clear all"
                        : query
                          ? "Select these"
                          : "Select all"
                    }}
                  </button>
                  <button
                    v-if="adjustedCount"
                    type="button"
                    class="link-btn"
                    :disabled="exporting"
                    @click="resetAllAdjustments"
                  >
                    Reset adjustments ({{ adjustedCount }})
                  </button>
                </div>
              </template>
            </AdminListControls>

            <div v-if="!restrooms?.length" class="empty">
              Nothing in the archive yet.
            </div>
            <div v-else-if="isEmptyFromSearch" class="empty">
              No entries match “{{ query }}”.
            </div>

            <ul v-else class="simple-list">
              <li
                v-for="e in visible"
                :key="e.slug"
                class="simple-row check-row"
                :class="{ focused: e.slug === focusSlug }"
              >
                <input
                  :id="`studio-check-${e.slug}`"
                  type="checkbox"
                  class="check"
                  :checked="checked.has(e.slug)"
                  :disabled="exporting"
                  :aria-label="`Include ${e.name}`"
                  @change="toggleChecked(e.slug)"
                />
                <button
                  type="button"
                  class="row-preview"
                  :aria-pressed="e.slug === focusSlug"
                  :disabled="exporting"
                  @click="focusSlug = e.slug"
                >
                  <span class="simple-main">
                    <span class="simple-title">{{ e.name }}</span>
                    <span class="simple-meta">
                      {{ e.date }} · {{ e.location }}
                    </span>
                  </span>
                  <span class="row-tags">
                    <span v-if="isAdjusted(e.slug)" class="pill pill-outline">
                      Adjusted
                    </span>
                    <span v-if="e.slug === focusSlug" class="pill pill-role">
                      Previewing
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>

        <footer class="studio-foot">
          <template v-if="exporting">
            <div class="progress" aria-hidden="true">
              <div
                class="progress-bar"
                :style="{
                  width: `${((exportIndex + exportProgress) / exportTotal) * 100}%`,
                }"
              />
            </div>
            <div class="foot-row">
              <span class="foot-status" role="status">
                {{ exportIndex + 1 }} of {{ exportTotal }} · {{ exportingName }}
                <span v-if="exportNote" class="dim"> · {{ exportNote }}</span>
              </span>
              <button type="button" class="link-btn" @click="cancelExport">
                Cancel
              </button>
            </div>
          </template>

          <template v-else>
            <div v-if="results.length" class="foot-results" role="status">
              <span>
                {{ doneCount }} of {{ results.length }} saved to
                {{ sinkLabel }}.
              </span>
              <span v-for="r in failed" :key="r.slug" class="form-error">
                {{ r.name }}: {{ r.error }}
              </span>
            </div>
            <div class="foot-row">
              <button
                type="button"
                class="primary-btn"
                :disabled="!batch.length || !exportSupported"
                @click="startExport"
              >
                Export
                {{ batch.length || "" }}
                {{ batch.length === 1 ? "video" : "videos" }}
              </button>
              <button
                v-if="folderAccess"
                type="button"
                class="btn folder-btn"
                @click="chooseFolder"
              >
                {{ chosenSink ? "Change folder…" : "Choose folder…" }}
              </button>
              <span v-if="!exportSupported" class="field-hint field-hint-warn">
                This browser can't encode H.264 video. Use Chrome or Safari.
              </span>
              <span v-else class="field-hint">
                {{
                  chosenSink
                    ? `Saving to ${chosenSink.label}.`
                    : folderAccess
                      ? "MP4s are written to a folder you choose."
                      : "MP4s go to your downloads."
                }}
              </span>
            </div>
          </template>
        </footer>
      </template>
    </aside>

    <main class="studio-stage">
      <div class="stage-area">
        <div class="stage-fit">
          <div v-if="isAdmin" class="stage-frame" :style="{ '--ratio': ratio }">
            <canvas ref="canvasEl" class="stage-canvas" />
            <p v-if="!focus" class="stage-note">
              Choose a restroom to preview.
            </p>
            <p v-else-if="previewError && !exporting" class="stage-note">
              {{ previewError }}
            </p>
            <p v-else-if="previewLoading && !exporting" class="stage-note">
              Loading…
            </p>
          </div>
        </div>
      </div>

      <!-- This entry's own framing, on top of the batch's. The viewer's pill
           idiom, since it sits on the black stage the way the viewer's controls
           sit on the scan. -->
      <div v-if="isAdmin && focus" class="stage-bar">
        <div class="stage-bar-row">
          <button
            type="button"
            class="nav-btn"
            :disabled="exporting"
            :aria-label="playing ? 'Pause at start' : 'Play'"
            @click="togglePlaying"
          >
            {{ playing ? "Pause" : "Play" }}
          </button>
          <span class="stage-name">{{ focus.name }}</span>
        </div>
        <div class="stage-bar-row">
          <label class="stage-control">
            <span>Start</span>
            <input
              class="range range-light"
              type="range"
              min="-180"
              max="180"
              step="1"
              :value="adjustmentFor(focus.slug).startAngle"
              :disabled="exporting"
              @input="
                onStartAngle(Number(($event.target as HTMLInputElement).value))
              "
            />
            <span class="stage-value"
              >{{ adjustmentFor(focus.slug).startAngle }}°</span
            >
          </label>
          <label class="stage-control">
            <span>Zoom</span>
            <input
              class="range range-light"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              :value="adjustmentFor(focus.slug).zoom"
              :disabled="exporting"
              @input="
                onFineZoom(Number(($event.target as HTMLInputElement).value))
              "
            />
            <span class="stage-value"
              >{{ Math.round(adjustmentFor(focus.slug).zoom * 100) }}%</span
            >
          </label>
          <button
            v-if="isAdjusted(focus.slug)"
            type="button"
            class="nav-btn"
            :disabled="exporting"
            @click="setAdjustment(focus.slug, { startAngle: 0, zoom: 1 })"
          >
            Reset
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* The layout's anatomy (layouts/default.vue): a white panel beside a black
   stage, Arial throughout, monochrome. The panel's contents use the account
   area's type scale and rows (assets/css/account.css), so the settings read
   as the same kind of thing as the Profile tab's. */

.studio-shell {
  position: fixed;
  inset: 0;
  display: flex;
  background: #000;
  overflow: hidden;
  font-family: Arial, Helvetica, sans-serif;

  --ctrl-btn-size: 26px;
  --ctrl-group-pad-y: 4px;
  --ctrl-group-border: 1px;
}

.studio-panel {
  flex: 0 0 auto;
  width: clamp(360px, 38%, 560px);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #000;
  font-size: 13px;
  line-height: 1.4;
  container: panel / inline-size;
}

.studio-body {
  --gutter: 20px;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 var(--gutter) var(--gutter);
}

/* The band under the site header, in the account tabs' place and style. */
.studio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-inline: calc(-1 * var(--gutter));
  padding: 10px var(--gutter);
  border-bottom: 1px solid #000;
  margin-bottom: 4px;
}

.studio-title {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
}

/* Orientation and ratio: two blocks on one line, set apart the way a slotted
   control is set apart from the sub-tabs. */
.seg-pair {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 11px;
  flex: 1 1 100%;
}

.seg-pair .seg {
  flex: 0 0 auto;
}

/* --- Segmented control ------------------------------------------------------ */
/* The account sub-tabs' segmented block (components/AccountSubTabs.vue), as a
   choice rather than navigation. */

.seg {
  display: flex;
  flex-wrap: wrap;
  flex: 1 1 100%;
}

.seg-btn {
  background: transparent;
  border: 1px solid #000;
  margin: 0 -1px -1px 0;
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
}

.seg-btn:hover:not(.active):not(:disabled) {
  background: #f4f4f4;
  color: #000;
}

.seg-btn.active {
  background: #000;
  color: #fff;
}

.seg-btn:disabled {
  cursor: not-allowed;
}

.seg-btn:disabled:not(.active) {
  opacity: 0.5;
}

/* --- Sliders ---------------------------------------------------------------- */
/* A hairline track and a square thumb: the archive has no rounded, raised
   controls, and a platform slider would be the only one on the page. */

.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 100%;
}

.range {
  appearance: none;
  -webkit-appearance: none;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 280px;
  height: 16px;
  margin: 0;
  background: transparent;
  cursor: pointer;
  --track: #000;
  --thumb: #000;
}

.range::-webkit-slider-runnable-track {
  height: 1px;
  background: var(--track);
}

.range::-moz-range-track {
  height: 1px;
  background: var(--track);
}

.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 14px;
  margin-top: -7px;
  background: var(--thumb);
  border: 0;
  border-radius: 0;
}

.range::-moz-range-thumb {
  width: 10px;
  height: 14px;
  background: var(--thumb);
  border: 0;
  border-radius: 0;
}

.range:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.range:focus-visible {
  outline: 1px solid #000;
  outline-offset: 2px;
}

.range-light {
  --track: #fff;
  --thumb: #fff;
  max-width: 160px;
}

.range-light:focus-visible {
  outline-color: #fff;
}

.range-value {
  font-size: 12px;
  min-width: 3.5em;
  font-variant-numeric: tabular-nums;
}

/* --- The checklist ---------------------------------------------------------- */

.studio-list {
  margin-top: 16px;
}

.list-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.list-count {
  font-size: 11px;
  color: #999;
}

.check-row {
  justify-content: flex-start;
  gap: 10px;
  padding: 0;
}

.check {
  flex: 0 0 auto;
  margin: 0;
  width: 14px;
  height: 14px;
  accent-color: #000;
  cursor: pointer;
}

.row-preview {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  background: transparent;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.row-preview:disabled {
  cursor: default;
}

.row-preview:hover:not(:disabled) .simple-title {
  text-decoration: underline;
}

.row-tags {
  display: flex;
  flex-shrink: 0;
}

.row-tags .pill:last-child {
  margin-right: 0;
}

/* --- Footer ----------------------------------------------------------------- */

.studio-foot {
  flex: 0 0 auto;
  border-top: 1px solid #000;
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.foot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.foot-row .primary-btn,
.foot-row .folder-btn {
  flex-shrink: 0;
}

/* As tall as the export button beside it. */
.foot-row .folder-btn {
  align-self: stretch;
}

.foot-row .field-hint {
  flex: 1 1 160px;
  text-align: right;
}

.foot-status {
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foot-results {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.progress {
  height: 2px;
  background: #e8e8e8;
}

.progress-bar {
  height: 100%;
  background: #000;
  transition: width 0.15s linear;
}

/* --- Stage ------------------------------------------------------------------ */

.studio-stage {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #fff;
}

.stage-area {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* The room the frame has, as a size container so the frame can measure it. */
.stage-fit {
  width: 100%;
  height: 100%;
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* As large as fits, in the export's exact shape. A hairline marks the frame's
   edge, since a black frame on the black stage would otherwise have none. */
.stage-frame {
  position: relative;
  width: min(100cqw, 100cqh * var(--ratio));
  aspect-ratio: var(--ratio);
  outline: 1px solid #333;
}

.stage-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.stage-note {
  position: absolute;
  inset: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  font-size: 14px;
  color: #fff;
  mix-blend-mode: difference;
}

.stage-bar {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 16px 16px;
  font-size: 14px;
}

.stage-bar-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.stage-name {
  max-width: 40ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.stage-value {
  min-width: 3.5em;
  font-variant-numeric: tabular-nums;
}

/* The layout's bottom-row pill (layouts/default.vue `.nav-btn`). */
.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  box-sizing: border-box;
  height: calc(
    var(--ctrl-btn-size) + 2 * var(--ctrl-group-pad-y) + 2 *
      var(--ctrl-group-border)
  );
  padding: 0 10px;
  transition: opacity 0.12s;
}

.nav-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@container panel (max-width: 400px) {
  .studio-body {
    --gutter: 12px;
  }
  .studio-foot {
    padding-inline: 12px;
  }
}

/* A phone stacks the stage over the panel, the way the site's sheet does. */
@media (max-width: 750px) {
  .studio-shell {
    flex-direction: column-reverse;
  }
  .studio-panel {
    width: auto;
    height: 55dvh;
  }
  .studio-stage {
    height: 45dvh;
  }
  .stage-area {
    padding: 12px;
  }
  .stage-bar {
    padding-bottom: 8px;
  }
}
</style>
