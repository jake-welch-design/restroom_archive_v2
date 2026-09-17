<script setup lang="ts">
/**
 * A silent, looping demo clip for the Archivist Guide, with a drag timeline in
 * place of the native controls.
 *
 * The guide's clips have no audio track at all, so the native control bar is
 * mostly affordances for things that don't exist (volume, captions, download).
 * What's left that a reader actually wants is "hold it there" and "show me that
 * bit again", which is a scrubber and a pause — this is those two, and nothing
 * else.
 *
 * `name` is an asset basename under public/guide/, not a URL: the component
 * appends the three extensions the encode script writes for every clip
 * (`.mp4`, `.webm`, `-poster.jpg`). Adding a clip means dropping that trio in
 * the folder and passing the basename.
 *
 * mp4 is listed first on purpose. The webm is the smaller file for only some of
 * these clips — the handheld scanning footage encodes worse in VP9 than in
 * H.264 — and H.264 plays everywhere that matters, so first-playable-source
 * order means every mainstream browser gets the file we tuned. The webm is a
 * genuine fallback, for builds shipped without the patent-encumbered decoder.
 */
const props = defineProps<{
  /** Asset basename under public/guide/, e.g. "scan-demo". */
  name: string;
  /** Caption, and the accessible name for the clip. */
  label: string;
}>();

const figure = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const track = ref<HTMLElement | null>(null);

/** Playhead as a fraction of duration, for the bar's width and aria value. */
const progress = ref(0);
const paused = ref(true);
const duration = ref(0);

/**
 * Set once the reader pauses by hand, and never cleared except by their own
 * play. Without it, scrolling a paused clip out of view and back would start it
 * again — the visibility rule below would read "in view, so play".
 */
const userPaused = ref(false);

/** Decided on mount: `matchMedia` doesn't exist during SSR. */
const allowAutoplay = ref(false);

let raf = 0;

/**
 * The bar is driven off rAF rather than `timeupdate`, which fires about four
 * times a second — over a column this wide that's a bar than jumps in visible
 * steps rather than sliding.
 */
function tick() {
  const v = video.value;
  if (v && v.duration > 0) progress.value = v.currentTime / v.duration;
  raf = requestAnimationFrame(tick);
}

function startTicking() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function stopTicking() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function onLoaded() {
  const v = video.value;
  if (v && Number.isFinite(v.duration)) duration.value = v.duration;
}

function onPlay() {
  paused.value = false;
  startTicking();
}

function onPause() {
  paused.value = true;
  stopTicking();
  // One last read: the loop stopped wherever the pause landed, and the bar
  // should agree with the frame on screen.
  const v = video.value;
  if (v && v.duration > 0) progress.value = v.currentTime / v.duration;
}

/** Play, tolerating the promise rejection a blocked autoplay produces. */
function tryPlay() {
  video.value?.play().catch(() => {});
}

function toggle() {
  const v = video.value;
  if (!v) return;
  if (v.paused) {
    userPaused.value = false;
    tryPlay();
  } else {
    userPaused.value = true;
    v.pause();
  }
}

/* ---- timeline ---- */

/**
 * Whether the clip was running when the drag started, so the drag can end the
 * way it began. Scrubbing pauses regardless: seeking a playing video fights the
 * playhead, and a held frame is the point of dragging in the first place.
 */
let resumeAfterDrag = false;

function seekToClientX(clientX: number) {
  const el = track.value;
  const v = video.value;
  if (!el || !v || !(v.duration > 0)) return;
  const rect = el.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  v.currentTime = fraction * v.duration;
  progress.value = fraction;
}

function onPointerDown(e: PointerEvent) {
  const v = video.value;
  if (!v) return;
  // Capture retargets the rest of the gesture to the track, so a drag that
  // leaves the bar — or the dialog — still scrubs, with no window listeners to
  // register and tear down.
  track.value?.setPointerCapture(e.pointerId);
  resumeAfterDrag = !v.paused;
  v.pause();
  seekToClientX(e.clientX);
}

function onPointerMove(e: PointerEvent) {
  if (track.value?.hasPointerCapture(e.pointerId)) seekToClientX(e.clientX);
}

function onPointerUp(e: PointerEvent) {
  if (!track.value?.hasPointerCapture(e.pointerId)) return;
  track.value.releasePointerCapture(e.pointerId);
  if (resumeAfterDrag) tryPlay();
}

function nudge(seconds: number) {
  const v = video.value;
  if (!v || !(v.duration > 0)) return;
  v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + seconds));
  progress.value = v.currentTime / v.duration;
}

/**
 * Arrow keys scrub, and stop there.
 *
 * The guide dialog pages steps on ArrowLeft/ArrowRight, bailing out only inside
 * form fields — a slider isn't one, so without this the keys would walk off the
 * step instead of moving the playhead.
 */
function onKeydown(e: KeyboardEvent) {
  const v = video.value;
  if (!v) return;

  const handled = () => {
    e.preventDefault();
    e.stopPropagation();
  };

  switch (e.key) {
    case "ArrowLeft":
      handled();
      nudge(-1);
      break;
    case "ArrowRight":
      handled();
      nudge(1);
      break;
    case "Home":
      handled();
      nudge(-v.duration);
      break;
    case "End":
      handled();
      nudge(v.duration);
      break;
    case " ":
    case "Enter":
      handled();
      toggle();
      break;
  }
}

/* ---- visibility ---- */

/**
 * Clips play only while they're on screen.
 *
 * The scan step stacks two clips and three stills in one scrolling column, so
 * plain `autoplay` would have both running — decoding, and on a phone pulling
 * megabytes — while the reader is somewhere else entirely in the step.
 */
let observer: IntersectionObserver | null = null;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const timeLabel = computed(
  () =>
    `${formatTime(progress.value * duration.value)} of ${formatTime(duration.value)}`,
);

onMounted(() => {
  const v = video.value;
  if (!v) return;

  // Belt and braces with the `muted` attribute: an unmuted video is not
  // allowed to autoplay, and these have nothing to hear anyway.
  v.muted = true;

  allowAutoplay.value = !window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;

  const el = figure.value;
  if (!el) return;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) {
        if (allowAutoplay.value && !userPaused.value) tryPlay();
      } else {
        v.pause();
      }
    },
    // Enough of the clip to be worth watching, rather than a sliver of it
    // starting playback as it clears the bottom edge.
    { threshold: 0.4 },
  );
  observer.observe(el);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  stopTicking();
});
</script>

<template>
  <figure ref="figure" class="guide-video">
    <div class="gv-frame">
      <video
        ref="video"
        :poster="`/guide/${props.name}-poster.jpg`"
        :aria-label="props.label"
        muted
        loop
        playsinline
        preload="metadata"
        @loadedmetadata="onLoaded"
        @play="onPlay"
        @pause="onPause"
        @click="toggle"
      >
        <source :src="`/guide/${props.name}.mp4`" type="video/mp4" />
        <source :src="`/guide/${props.name}.webm`" type="video/webm" />
      </video>

      <!-- Shown only while stopped, which covers a hand pause, a reader who
           asked for reduced motion, and an autoplay the browser refused (iOS
           in Low Power Mode, most often). Without it a refused autoplay leaves
           a poster with no way to start it. -->
      <button
        v-if="paused"
        type="button"
        class="gv-play"
        aria-label="Play"
        @click="toggle"
      >
        <span class="gv-play-glyph" aria-hidden="true" />
      </button>
    </div>

    <div
      ref="track"
      class="gv-track"
      role="slider"
      tabindex="0"
      aria-label="Timeline"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
      :aria-valuetext="timeLabel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <!-- The fill's leading edge is the playhead; there is no separate handle
           to draw, since the bar is the full width of the video and the join
           between black and white already says where you are. -->
      <div class="gv-fill" :style="{ width: `${progress * 100}%` }" />
    </div>

    <figcaption>{{ props.label }}</figcaption>
  </figure>
</template>

<style scoped>
/* The dialog is in the top layer and inherits none of the account page's
   tokens, so everything here is literal, as in AccountArchivistGuideDialog. */
.guide-video {
  margin: 0 0 0.9em;
}

.gv-frame {
  position: relative;
  line-height: 0;
}

/* Every guide clip and still is square, and a full-column square would stand
   taller than the dialog's scroll area — so the media is capped and centred
   rather than filling the column. */
.guide-video video {
  display: block;
  width: 100%;
  max-width: 460px;
  aspect-ratio: 1;
  margin: 0 auto;
  border: 1px solid #ddd;
  background: #f7f7f7;
  cursor: pointer;
}

.gv-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgb(0 0 0 / 0.15);
  cursor: pointer;
  padding: 0;
}

.gv-play-glyph {
  width: 0;
  height: 0;
  /* A triangle from borders: no icon font, no inline SVG for one shape. */
  border-style: solid;
  border-width: 13px 0 13px 21px;
  border-color: transparent transparent transparent #fff;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 0.5));
}

/* An outlined bar butted to the foot of the video, the same width as it:
   unplayed is white inside, played is solid black, and nothing else.

   Deliberately NOT `box-sizing: border-box`. There is no global border-box
   reset, so the video is content-box — `width: 100%` plus a 1px border. The
   track has to use the same box model for the two to come out the same width
   on screen; switching just this element would make it 2px narrower.

   `position: relative` is what keeps the seam a single line. `.gv-frame` is
   positioned, so it paints above static siblings and its grey video border
   would otherwise show through the 1px overlap; positioning the track too puts
   both in the same paint step, where the later one in the tree wins. */
.gv-track {
  position: relative;
  width: 100%;
  max-width: 460px;
  height: 10px; /* 12px on screen, with the borders */
  margin: -1px auto 0; /* sit on the video's bottom border, not below it */
  border: 1px solid #000;
  background: #fff;
  cursor: pointer;
  touch-action: none; /* or a horizontal drag scrolls the step instead */
}

.gv-fill {
  height: 100%;
  background: #000;
}

.gv-track:focus-visible {
  outline: 2px solid #000;
  outline-offset: 2px;
}

/* Clear of the bar rather than tucked under it: the bar now has an edge of its
   own, and 2px against it read as part of the control. */
.guide-video figcaption {
  max-width: 460px;
  margin: 7px auto 0;
  font-size: 12px;
  line-height: 1.4;
  color: #666;
}
</style>
