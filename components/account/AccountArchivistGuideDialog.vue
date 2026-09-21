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
  { id: "process", label: "Processing", title: "Process and optimize" },
  { id: "details", label: "Details", title: "Take note of contextual details" },
  {
    id: "export",
    label: "Download",
    title: "Export as .GLB/.GLTF",
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
      <h2 id="guide-title">Submission Guide</h2>
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
      <!-- <p class="guide-step-count">Step {{ index + 1 }} of {{ STEPS.length }}</p> -->
      <h3>{{ step.title }}</h3>

      <!-- Media is a <GuideVideo> or <GuideImage>, both taking an asset
           basename under public/guide/ and a caption. Every slot is filled;
           adding one means encoding the asset (scripts/encode-guide-media.sh)
           and dropping the component into the step. -->

      <template v-if="step.id === 'app'">
        <p>
          Download a 3D scanning app to your mobile device.
          <a href="https://scaniverse.com/" target="_blank" rel="noopener"
            >Scaniverse</a
          >
          is a great option. While Jake previously used Polycam, he now finds
          Scaniverse to be the most reliable at rendering complete restroom
          models without significant holes or drift, and it’s totally free!
        </p>
        <p>
          For scanning a restroom, open Scaniverse and select:
          <strong>+ → Mesh → Large Object / Area</strong>. Then begin scanning!
        </p>
      </template>

      <template v-else-if="step.id === 'scan'">
        <h4>LiDAR vs. photogrammetry</h4>
        <p>
          To produce scans for The Restroom Archive, 3D scanning apps typically
          use two methods: LiDAR and photogrammetry.
        </p>
        <p>
          LiDAR, or light detection and ranging, uses laser sensors and your
          phone camera to measure distances and build a textured mesh. iPhone
          Pro/Max models from 12 onward, as well as select Android devices, have
          LiDAR sensors.
        </p>
        <p>
          Photogrammetry works by taking multiple overlapping photographs of a
          space from different angles and stitching them together to form an
          approximate mesh. While photogrammetry is less accurate than LiDAR, it
          is still a viable method for those who can’t use LiDAR on their
          device.
        </p>
        <p>
          Click
          <a
            href="https://dev.scaniverse.com/support"
            target="_blank"
            rel="noopener"
            >here</a
          >
          to read more tips on scanning techniques.
        </p>

        <h4>Scanning techniques</h4>
        <p>
          While techniques may vary depending on the method you choose to make a
          scan, it is generally recommended to start towards the bottom in an
          empty corner, and then slowly and methodically move around the room in
          one direction, from bottom to top, stopping to capture all angles of
          every object in the space, until you reach the top.
        </p>
        <p>
          Be sure to capture the floor and ceiling and avoid crossing over the
          same spot too many times. If using LiDAR, the lasers will bounce off
          of reflective surfaces such as mirrors or stainless steel trashcans or
          appliances. Spend a bit of time on more matte, reflective surfaces to
          capture them at a steeper angle if you can—but it is expected that
          these will create holes and artifacts—that’s okay.
        </p>
        <GuideVideo
          name="scan-demo"
          label="Demo of scanning a restroom from all angles from bottom to top"
        />

        <h4>Common issues</h4>
        <p class="guide-note">
          <strong>Note:</strong> Since switching to Scaniverse, Jake has
          encountered these issues much less frequently than when he was using
          Polycam.
        </p>
        <p>
          The most common scanning issues Archivists encounter are large holes,
          blurry patches, and scanning drift. If these are too severe or distort
          important elements beyond recognition, the scan will likely be
          rejected from being added to the Archive.
        </p>
        <p>
          Large holes and blurry spots most often occur when an area is missed
          during the scanning process. Occasionally, even if a surface seemed to
          be well-captured, these gaps will appear if the surface is busy and
          complicated (like walls covered with heavy graffiti) or if there was
          low lighting in the space. Blurry patches occur where there were
          smaller holes, and the 3D scanning software filled the gap during
          processing, approximating the missed texture.
        </p>
        <GuideImage
          name="holes"
          label="Example of scan missing important details"
        />
        <GuideImage
          name="blur"
          label="Example of scan with holes, blurry patches, and surface drift"
        />
        <p>
          Scanning drift is when parts of the mesh don’t line up, causing
          artifacts such as duplicate objects and breaks in what are obviously
          straight lines. This most commonly happens when moving too fast or
          when going over the same portion of the space too many times.
        </p>
        <GuideImage
          name="drift"
          label="Example of Scanning drift, note the paper towel dispenser, trashcan, and door."
        />
        <p>
          All of these issues can be prevented by following the scanning
          techniques as outlined above. They do, however, still occur no matter
          what. Artifacts are expected, so if you think the scan is still high
          enough quality where it matters (toilets, sinks, etc.), you are
          encouraged to still submit.
        </p>

        <h4>Rescuing a scan</h4>
        <p>
          If your scan came out with some of the above issues, it might not be
          beyond saving. Many 3D scanning apps offer reprocessing tools. In
          Polycam, for example, you can reprocess using Dense mode, Custom, and
          Cloud. Try experimenting with your app’s options, adjusting settings
          as you go. Oftentimes, holes will fill, and scanning drift will
          resolve itself.
        </p>
        <GuideVideo
          name="reprocess"
          label="Example of using Polycam's reprocessing settings"
        />
      </template>

      <template v-else-if="step.id === 'process'">
        <p>
          After scanning, there are likely to still be artifacts caused by
          reflective surfaces, as mentioned earlier. Sometimes an error might
          also cause the scan to process at a tilted angle. It is encouraged to
          go in and crop and level your restroom models before exporting.
        </p>
        <GuideVideo name="crop" label="Cropping a scan" />
      </template>

      <template v-else-if="step.id === 'details'">
        <p>
          As an Archivist, it’s important to not only capture the space, but to
          provide valuable context. Take note while you’re in the space of any
          peculiarities. How does someone access the restroom? Was the door
          outside labeled anything unusual? Is there any storytelling in the
          restroom that ties it to the establishment or neighborhood? These
          details will be important during the submission process.
        </p>
        <GuideImage
          name="description-example"
          label="Example of a description which provides excellent context to the scan"
        />
      </template>

      <template v-else-if="step.id === 'export'">
        <p>
          Once you’re ready to submit, download the model as a .GLB/.GLTF file.
          This format is important as it saves the 3D mesh together with its
          texture and is relatively small in file size. Note that the max file
          size to upload is 25MB, so if your scan is larger, it is recommended
          that you compress it beforehand.
        </p>
        <GuideVideo
          name="download"
          label="Exporting from Polycam on desktop: choose GLTF under Mesh, then Export."
        />
      </template>

      <template v-else-if="step.id === 'upload'">
        <p>
          Find your exported file and upload it to the site. Follow the
          submission process and be sure to check the tool tips along the way if
          you need any extra guidance. Write a detailed description using any
          notes you gathered earlier and submit. Once approved, your restroom
          will now be part of The Restroom Archive!
        </p>
        <GuideVideo
          name="upload"
          label="The submission wizard end to end: scan, details, description, review."
        />
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

.guide-body img,
.guide-body video {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 0 0.9em;
  border: 1px solid #ddd;
}

.guide-note {
  border-left: 3px solid #000;
  padding: 2px 0 2px 10px;
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
