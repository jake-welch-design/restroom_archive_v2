<script setup lang="ts">
/**
 * The Archivist Guide: a step-by-step walkthrough of making a submission, from
 * installing a scanning app to uploading the finished file. Opened by the
 * button in AccountArchivistGuide.
 *
 * Same native <dialog> shell as LegalDialog, for the same reasons (focus trap,
 * Escape, inert background). Steps are paged like a gallery: a tab row to jump
 * anywhere, and arrows, buttons or keys, to walk through in order.
 *
 * Each step's content lives in its own `<template v-if>` block below, keyed by
 * the step id, so writing a step means editing only that block.
 */
import type { SubTab } from "~/components/AccountSubTabs.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

type Step = { id: string; label: string; title: string };

// `label` is the short name for the tab row, `title` the step's full heading.
const STEPS: Step[] = [
  { id: "app", label: "App", title: "Download a 3D scanning app" },
  { id: "scan", label: "Scan", title: "Scan your restroom" },
  { id: "process", label: "Process", title: "Process and optimize" },
  { id: "crop", label: "Crop", title: "Crop and clean up the scan" },
  { id: "details", label: "Details", title: "Take note of contextual details" },
  {
    id: "export",
    label: "Export",
    title: "Open on desktop and save as .GLB/.GLTF",
  },
  {
    id: "upload",
    label: "Upload",
    title: "Upload and complete your submission",
  },
];

const tabs: SubTab[] = STEPS.map((s, i) => ({
  id: s.id,
  label: `${i + 1}. ${s.label}`,
}));

const dialog = ref<HTMLDialogElement | null>(null);
const body = ref<HTMLElement | null>(null);
const index = ref(0);

const step = computed(() => STEPS[index.value]!);
const isFirst = computed(() => index.value === 0);
const isLast = computed(() => index.value === STEPS.length - 1);

const selection = computed({
  get: () => step.value.id,
  set: (id: string) => {
    const i = STEPS.findIndex((s) => s.id === id);
    if (i >= 0) index.value = i;
  },
});

function prev() {
  if (!isFirst.value) index.value--;
}
function next() {
  if (isLast.value) emit("close");
  else index.value++;
}

// A long step scrolled to its end would otherwise open the next one partway
// down.
watch(index, () => body.value?.scrollTo({ top: 0 }));

watch(
  () => props.open,
  (open) => {
    const el = dialog.value;
    if (!el) return;
    // See LegalDialog: showModal() on an open dialog throws, and close() on a
    // closed one still fires `close`.
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  },
);

function onClick(e: MouseEvent) {
  if (e.target === dialog.value) emit("close");
}

// Arrow keys page the guide, as in a gallery. Left alone in anything
// editable, should a step ever hold a field.
function onKeydown(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    prev();
  } else if (e.key === "ArrowRight" && !isLast.value) {
    e.preventDefault();
    next();
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="guide-dialog"
    aria-labelledby="guide-title"
    @close="emit('close')"
    @click="onClick"
    @keydown="onKeydown"
  >
    <div class="guide-head">
      <h2 id="guide-title">Archivist Guide</h2>
      <button
        type="button"
        class="guide-close"
        aria-label="Close"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <div class="guide-nav">
      <AccountSubTabs
        v-model="selection"
        class="guide-tabs"
        :tabs="tabs"
        variant="plain"
      />
    </div>

    <div ref="body" class="guide-body thin-scroll" role="tabpanel">
      <p class="guide-step-count">Step {{ index + 1 }} of {{ STEPS.length }}</p>
      <h3>{{ step.title }}</h3>

      <!-- 1. Download a 3D scanning app -->
      <template v-if="step.id === 'app'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>

      <!-- 2. Scan your restroom -->
      <template v-else-if="step.id === 'scan'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>

      <!-- 3. Process and optimize -->
      <template v-else-if="step.id === 'process'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>

      <!-- 4. Crop and clean up the scan -->
      <template v-else-if="step.id === 'crop'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>

      <!-- 5. Take note of contextual details -->
      <template v-else-if="step.id === 'details'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>

      <!-- 6. Open on desktop and save as .GLB/.GLTF -->
      <template v-else-if="step.id === 'export'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>

      <!-- 7. Upload and complete your submission -->
      <template v-else-if="step.id === 'upload'">
        <p class="guide-placeholder">Content coming soon.</p>
      </template>
    </div>

    <div class="guide-foot">
      <button
        type="button"
        class="guide-arrow"
        :disabled="isFirst"
        aria-label="Previous step"
        @click="prev"
      >
        ←
        <span class="guide-arrow-label">{{
          isFirst ? "" : STEPS[index - 1]!.label
        }}</span>
      </button>

      <span class="guide-dots" aria-hidden="true">
        <span
          v-for="(s, i) in STEPS"
          :key="s.id"
          class="guide-dot"
          :class="{ active: i === index }"
        />
      </span>

      <button
        type="button"
        class="guide-arrow"
        :aria-label="isLast ? 'Close guide' : 'Next step'"
        @click="next"
      >
        <span class="guide-arrow-label" :class="{ keep: isLast }">{{
          isLast ? "Done" : STEPS[index + 1]!.label
        }}</span>
        {{ isLast ? "" : "→" }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
/* Shell, head and body mirror LegalDialog so the two read as one family. The
   dialog is in the top layer and inherits none of the account page's tokens. */
.guide-dialog {
  width: min(680px, calc(100vw - 32px));
  height: min(80vh, 760px);
  padding: 0;
  border: 1px solid #000;
  background: #fff;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  overflow: hidden;
}

/* [open] only: see the note in LegalDialog on `display` and closed dialogs. */
.guide-dialog[open] {
  display: flex;
  flex-direction: column;
}

.guide-dialog::backdrop {
  background: rgb(0 0 0 / 0.35);
}

.guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #ddd;
  flex: 0 0 auto;
}

.guide-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: #666;
}

.guide-close {
  border: none;
  background: none;
  padding: 0 4px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #000;
}

.guide-nav {
  flex: 0 0 auto;
  padding: 10px 16px 0;
  border-bottom: 1px solid #ddd;
}

/* The plain row is built to tuck under a segmented one; here it stands alone,
   so its pull-up margin comes off. */
.guide-nav .guide-tabs.subtabs {
  margin: 0 0 6px;
}

.guide-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1 1 auto;
  line-height: 1.5;
}

.guide-step-count {
  margin: 0 0 4px;
  font-size: 12px;
  color: #666;
}

.guide-body h3 {
  margin: 0 0 1em;
  font-size: 16px;
  font-weight: 700;
}

.guide-body h4 {
  margin: 1.2em 0 0.4em;
  font-size: 13px;
  font-weight: 700;
}

.guide-body p,
.guide-body li {
  font-size: 13px;
  margin: 0 0 0.9em;
}

.guide-body ul,
.guide-body ol {
  margin: 0 0 0.9em;
  padding-left: 1.2em;
}

.guide-body li {
  margin-bottom: 0.4em;
}

.guide-body a {
  color: #000;
  text-decoration: underline;
}

.guide-body img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 0 0.9em;
  border: 1px solid #ddd;
}

.guide-placeholder {
  color: #999;
}

.guide-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid #ddd;
}

.guide-arrow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 90px;
  background: transparent;
  border: 1px solid #000;
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  color: #000;
  cursor: pointer;
}

.guide-arrow:last-child {
  justify-content: flex-end;
}

.guide-arrow:hover:not(:disabled) {
  background: #f4f4f4;
}

.guide-arrow:disabled {
  border-color: #ddd;
  color: #bbb;
  cursor: default;
}

.guide-dots {
  display: flex;
  gap: 6px;
}

.guide-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ddd;
}

.guide-dot.active {
  background: #000;
}

/* Viewport, not container, query: see the note at the end of LegalDialog. */
@media (max-width: 560px) {
  .guide-body p,
  .guide-body li {
    font-size: 12px;
  }
  .guide-arrow {
    min-width: 0;
  }
  .guide-arrow-label {
    display: none;
  }
  .guide-arrow-label.keep {
    display: inline;
  }
}
</style>
