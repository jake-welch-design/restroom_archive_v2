<script setup lang="ts">
import type * as THREE from "three";
import { useThreeScene } from "~/composables/useThreeScene";
import type { CameraSnapshot } from "~/composables/useThreeScene";
import { apiErrorMessage } from "~~/shared/utils/apiError";
import type { Crop } from "~~/shared/utils/crop";

const props = defineProps<{
  modelUrl?: string | null;
  slug?: string | null;
  thumbUrl?: string | null;
  /** Needed for the crop endpoint, which is keyed by id like every admin route. */
  restroomId?: number | null;
  crop?: Crop | null;
}>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const modelUrlRef = toRef(props, "modelUrl");
const slugRef = toRef(props, "slug");
const cropRef = toRef(props, "crop");

const { loggedIn, isAdmin } = useAuth();
const { selectedAnnotationId, selectAnnotation } = useSelection();

// Annotation data
const { data: annotations, refresh: refreshAnnotations } =
  useAnnotations(slugRef);

// Compose mode state
const pendingPoint = ref<THREE.Vector3 | null>(null);
const pendingSnapshot = ref<CameraSnapshot | null>(null);
const pendingScreenX = ref(0);
const pendingScreenY = ref(0);
const saving = ref(false);

function handlePickPoint(point: THREE.Vector3, snapshot: CameraSnapshot) {
  pendingSnapshot.value = snapshot;
  pendingPoint.value = point;
}

const {
  loading,
  error,
  mode,
  createMode,
  markersVisible,
  cropEditing,
  cropMode,
  cropDraft,
  cropEmptiesScan,
  setMode,
  flyTo,
  project,
  captureThumb,
  startCrop,
  cancelCrop,
  resetCropBox,
  setCropMode,
  cropHasChanges,
  pendingCrop,
  applyPendingCrop,
} = useThreeScene(canvasRef, modelUrlRef, cropRef, handlePickPoint);

// Fly to annotation when selectedAnnotationId changes
watch(selectedAnnotationId, (id) => {
  if (id == null) return;
  markersVisible.value = true;
  const a = annotations.value?.find((a) => a.id === id);
  if (!a) return;
  flyTo({
    cameraMode: a.cameraMode,
    cameraFov: a.cameraFov,
    modelRotationY: a.modelRotationY ?? 0,
    orbitPosX: a.orbitPosX ?? undefined,
    orbitPosY: a.orbitPosY ?? undefined,
    orbitPosZ: a.orbitPosZ ?? undefined,
    orbitTargetX: a.orbitTargetX ?? undefined,
    orbitTargetY: a.orbitTargetY ?? undefined,
    orbitTargetZ: a.orbitTargetZ ?? undefined,
    rotationX: a.rotationX ?? undefined,
    rotationY: a.rotationY ?? undefined,
  });
});

// Hide markers while a new model loads, restore when done
watch(modelUrlRef, () => {
  markersVisible.value = false;
});
watch(loading, (isLoading) => {
  if (!isLoading && modelUrlRef.value) markersVisible.value = true;
});

// Auto-capture thumbnail after model loads if none exists yet
watch(loading, (isLoading) => {
  if (isLoading || props.thumbUrl || !isAdmin.value || !props.slug) return;
  const slug = props.slug;
  setTimeout(async () => {
    const dataUrl = captureThumb();
    if (!dataUrl) return;
    try {
      await $fetch(`/api/restrooms/${slug}/thumbnail`, {
        method: "POST",
        body: { imageData: dataUrl },
      });
      await refreshNuxtData("restrooms");
    } catch {
      /* non-fatal */
    }
  }, 800);
});

// Track last pointer position for compose popup placement
function onCanvasPointerDown(e: PointerEvent) {
  pendingScreenX.value = e.clientX;
  pendingScreenY.value = e.clientY;
}

// Adjust pendingScreenX/Y relative to canvas on pick
watch(pendingPoint, (pt) => {
  if (!pt) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  pendingScreenX.value = pendingScreenX.value - rect.left;
  pendingScreenY.value = pendingScreenY.value - rect.top;
});

async function saveAnnotation(body: string) {
  if (!props.slug || !pendingPoint.value) return;
  saving.value = true;
  try {
    await $fetch(`/api/restrooms/${props.slug}/annotations`, {
      method: "POST",
      body: {
        body,
        pointX: pendingPoint.value.x,
        pointY: pendingPoint.value.y,
        pointZ: pendingPoint.value.z,
        ...pendingSnapshot.value,
      },
    });
    pendingPoint.value = null;
    pendingSnapshot.value = null;
    createMode.value = false;
    await refreshAnnotations();
  } catch {
    // leave popup open on error
  } finally {
    saving.value = false;
  }
}

/* --- Admin crop ----------------------------------------------------------- */

/**
 * Available on any entry that exists, published or still in the review queue:
 * the point of offering it at review time is to fix the framing before the
 * entry reaches the archive rather than afterwards. The wizard's preview of an
 * unsaved scan has no id, which is what rules it out there.
 */
const canCrop = computed(
  () => isAdmin.value && props.restroomId != null && !!props.modelUrl,
);

const cropSaving = ref(false);

/**
 * How many annotations sit on geometry the box as drawn would take away.
 *
 * Which side that is depends on the mode, so the same test answers both.
 * Annotation points are stored in model-local space, the same space the box is
 * in, so it is a direct comparison with nothing to transform. Shown on the crop
 * note as a warning rather than stopping the save: cropping away an annotated
 * surface is a legitimate thing to do, and only the marker loses its surface.
 */
const strandedCount = computed(() => {
  const d = cropDraft.value;
  const list = annotations.value;
  if (!d || !list?.length) return 0;
  return list.filter((a) => {
    const inside =
      a.pointX >= d.minX &&
      a.pointX <= d.maxX &&
      a.pointY >= d.minY &&
      a.pointY <= d.maxY &&
      a.pointZ >= d.minZ &&
      a.pointZ <= d.maxZ;
    return cropMode.value === "keep" ? !inside : inside;
  }).length;
});

/**
 * The crop button: the first press opens the tool, the next one saves.
 *
 * There is no separate save control, so this is it. Abandoning an edit instead
 * is Escape, or moving to another scan.
 */
function onCropButton() {
  if (!cropEditing.value) {
    startCrop();
    return;
  }
  if (!cropSaving.value) void saveCrop();
}

function toggleCropMode() {
  const next = cropMode.value === "keep" ? "remove" : "keep";
  setCropMode(next);
  showToast(next === "keep" ? "Keep inside box" : "Remove inside box");
}

function onResetCrop() {
  resetCropBox();
  showToast("Crop reset");
}

function cancelCropEdit() {
  cancelCrop();
  showToast("Crop canceled");
}

async function saveCrop() {
  const id = props.restroomId;
  if (id == null) return;

  // Opening the tool and pressing the button again without touching anything
  // is closing it, not saving the same crop over itself.
  if (!cropHasChanges()) {
    cancelCrop();
    showToast("No changes");
    return;
  }

  if (cropEmptiesScan.value) {
    showToast("That box covers the whole scan", 2500);
    return;
  }

  // Computed before the request, and in `remove` mode this is where the scan's
  // vertices get walked to find what survives.
  const pending = pendingCrop();
  if (!pending) {
    showToast("That crop would leave nothing of the scan", 2500);
    return;
  }

  cropSaving.value = true;
  try {
    await $fetch(`/api/admin/restrooms/${id}/crop`, {
      method: "POST",
      body: pending,
    });
    // Only now, so a failed save leaves the editor open on the box the admin
    // drew rather than re-framing on a crop that was never stored.
    applyPendingCrop(pending);

    // The crop changed the framing, so the catalog's thumbnail is of the old
    // one. Re-rendered here rather than left to the offline script, because
    // the corrected picture is the whole point of the correction.
    const dataUrl = captureThumb();
    if (dataUrl && props.slug) {
      await $fetch(`/api/restrooms/${props.slug}/thumbnail`, {
        method: "POST",
        body: { imageData: dataUrl },
      });
    }

    // The catalog for the new crop and thumbnail, the pending queue for the
    // same reason when the entry is still in review, and the annotations
    // because the save shifted every stored camera by the re-centre.
    await Promise.all([
      refreshNuxtData(["restrooms", "admin-restrooms"]),
      refreshAnnotations(),
    ]);
    showToast(pending.crop ? "Crop saved" : "Crop cleared");
  } catch (e) {
    // Longer than the usual toast: this is the only place the failure is said,
    // and the tool stays open on the box so the save can be tried again.
    showToast(apiErrorMessage(e, "Could not save the crop."), 3500);
  } finally {
    cropSaving.value = false;
  }
}

// Transient toast describing the last viewport-button action
const toastMessage = ref("");
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string, duration = 1200) {
  toastMessage.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = "";
    toastTimer = null;
  }, duration);
}

function toggleViewMode() {
  const next = mode.value === "pov" ? "orbit" : "pov";
  setMode(next);
  showToast(next === "pov" ? "POV view" : "Orbit view");
}

function toggleMarkers() {
  markersVisible.value = !markersVisible.value;
  showToast(markersVisible.value ? "Annotations on" : "Annotations off");
}

function toggleCreateMode() {
  createMode.value = !createMode.value;
  if (!createMode.value) {
    pendingPoint.value = null;
    pendingSnapshot.value = null;
  }
  if (!createMode.value) showToast("Canceled");
}

// Esc to cancel create mode / close active bubble
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (cropEditing.value) {
      if (!cropSaving.value) cancelCropEdit();
    } else if (pendingPoint.value) {
      pendingPoint.value = null;
      pendingSnapshot.value = null;
    } else if (createMode.value) {
      createMode.value = false;
    } else if (selectedAnnotationId.value != null) {
      selectAnnotation(null);
    }
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="viewer">
    <canvas ref="canvasRef" @pointerdown="onCanvasPointerDown" />

    <div class="overlay">
      <div class="overlay-right">
        <!-- The scan's own controls: view mode, and the crop tool's buttons. A
        wrapper only so that on the mobile sheet they can stack up the
        left-hand edge; on desktop it is display: contents and the row is laid
        out as if it were not there.

        DOM order is the desktop order, left to right: view mode, reset, mode,
        crop. The two tool buttons appear between view mode and crop, so the
        crop button, which is pressed once to open the tool and again to save,
        never moves between the two presses. Mobile reorders them with `order`
        for the same reason; see the stylesheet. -->
        <div class="ctrl-stack">
          <!-- View mode: single circle that changes icon -->
          <div class="ctrl-group view-mode-group">
            <button
              class="ctrl-btn"
              :title="
                mode === 'pov' ? 'Switch to orbit view' : 'Switch to POV view'
              "
              :aria-label="
                mode === 'pov' ? 'Switch to orbit view' : 'Switch to POV view'
              "
              @click="toggleViewMode"
            >
              <!-- Eye icon for POV mode -->
              <svg
                v-if="mode === 'pov'"
                viewBox="0 0 16 16"
                width="20"
                height="20"
                fill="none"
                stroke="#ffffff"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
              <!-- Orbit icon for Orbit mode -->
              <svg
                v-else
                viewBox="252 0 810 750"
                width="20"
                height="20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M657.382716 505.679012L442.469136 379.259259V126.419753L657.382716 0l214.91358 126.419753v252.839506z m164.345679-151.703703V192.158025l-139.061728 84.878222v162.550518z m-328.691358 0l139.061728 85.586172V269.602765l-139.061728-83.361185V353.975309zM657.382716 50.567901l-144.371358 88.822519L660.214519 227.555556h5.676246l140.174223-85.560889z"
                  fill="#ffffff"
                />
                <path
                  d="M720.592593 670.024691l-113.777778 101.135803v-79.03763C412.988049 675.018272 252.839506 581.290667 252.839506 467.753086c0-51.098864 30.340741-98.089086 80.845432-136.06558l33.261037 35.043556C326.997333 395.39042 303.407407 430.168494 303.407407 467.753086c0 86.926222 137.569975 158.84642 303.407408 173.776593V568.888889z"
                  fill="#ffffff"
                />
                <path
                  d="M783.802469 632.907852C916.770765 607.446914 1011.358025 543.149827 1011.358025 467.753086c0-42.085136-29.50637-80.693728-78.569877-111.059753l34.866568-34.866568C1026.439901 361.34558 1061.925926 412.204247 1061.925926 467.753086c0 100.819753-116.67279 186.191012-278.123457 216.064v-50.909234z"
                  fill="#ffffff"
                />
              </svg>
            </button>
          </div>

          <!-- Crop tool buttons, only while it is open. -->
          <div
            v-if="canCrop && cropEditing"
            class="ctrl-group crop-reset-group"
          >
            <button
              class="ctrl-btn"
              title="Reset crop"
              aria-label="Reset crop"
              @click="onResetCrop"
            >
              <!-- Counter-clockwise arrow. -->
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="#ffffff"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>

          <div v-if="canCrop && cropEditing" class="ctrl-group crop-mode-group">
            <!-- One press flips it, like the view-mode button, and the icon
            shows the mode in force rather than the one a press would choose. -->
            <button
              class="ctrl-btn"
              :title="
                cropMode === 'keep'
                  ? 'Keeping inside the box (switch to removing)'
                  : 'Removing inside the box (switch to keeping)'
              "
              :aria-label="
                cropMode === 'keep'
                  ? 'Switch to removing what is inside the box'
                  : 'Switch to keeping what is inside the box'
              "
              @click="toggleCropMode"
            >
              <svg
                viewBox="0 0 16 16"
                width="18"
                height="18"
                fill="none"
                stroke="#ffffff"
                stroke-width="1.6"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M3 8h10" />
                <path v-if="cropMode === 'keep'" d="M8 3v10" />
              </svg>
            </button>
          </div>

          <!-- Crop: admins only, and only on an entry that exists. Sits with the
          view-mode control rather than the annotation group because it is about
          the scan itself, not about what has been written on it. -->
          <div v-if="canCrop" class="ctrl-group crop-group">
            <button
              class="ctrl-btn ctrl-crop"
              :class="{ active: cropEditing }"
              :title="cropEditing ? 'Save crop' : 'Crop and re-centre scan'"
              :aria-label="
                cropEditing ? 'Save crop' : 'Crop and re-centre scan'
              "
              :aria-pressed="cropEditing"
              :disabled="cropSaving"
              @click="onCropButton"
            >
              <!-- Crop marks: two overlapping right angles. -->
              <svg
                viewBox="0 0 16 16"
                width="18"
                height="18"
                fill="none"
                stroke="#ffffff"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M4.5 1v10.5H15" />
                <path d="M1 4.5h10.5V15" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Annotation controls: hidden without a slug (e.g. an in-progress
        submission preview, which has nothing to annotate yet). Otherwise
        toggle always visible; add button signed-in users only. -->
        <!-- Concealed rather than removed while cropping. The desktop row is
        anchored to the right, so taking these out would slide the crop button
        sideways between the press that opens the tool and the one that saves
        it. -->
        <div
          v-if="props.slug"
          class="ctrl-group annotation-group"
          :class="{ 'is-concealed': cropEditing }"
        >
          <button
            class="ctrl-toggle"
            :class="{ active: markersVisible }"
            title="Show annotations"
            :aria-label="
              markersVisible ? 'Hide annotations' : 'Show annotations'
            "
            :aria-pressed="markersVisible"
            @click="toggleMarkers"
          >
            <span class="toggle-track"><span class="toggle-thumb" /></span>
          </button>
          <button
            v-if="loggedIn"
            class="ctrl-btn ctrl-add"
            :class="{ active: createMode }"
            :title="
              createMode
                ? 'Click to place an annotation (Esc to cancel)'
                : 'Add annotation'
            "
            :aria-label="
              createMode
                ? 'Click to place an annotation (Esc to cancel)'
                : 'Add annotation'
            "
            :aria-pressed="createMode"
            @click="toggleCreateMode"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="#ffffff"
              stroke-width="1"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M11.5 2.5l2 2L6 12H4v-2z" />
              <path d="M10 4l2 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- The crop tool's note, in the annotation hint's place and style. A toast
    replaces it while it shows, as toasts replace that hint, which is how the
    mode toggle's message gets the spot to itself. The warning is here because
    there is no panel left to put it in, and it is the one thing worth knowing
    before the next press saves. -->
    <div v-if="cropEditing && !toastMessage" class="crosshair-hint crop-note">
      {{ cropSaving ? "SAVING" : "CROP" }}
      <span v-if="!cropSaving && cropEmptiesScan" class="crop-note-warn">
        · covers the whole scan
      </span>
      <span v-else-if="!cropSaving && strandedCount" class="crop-note-warn">
        · {{ strandedCount }}
        {{ strandedCount === 1 ? "annotation" : "annotations" }} affected
      </span>
    </div>

    <div
      v-if="createMode && !pendingPoint && !toastMessage"
      class="crosshair-hint"
    >
      Click to place an annotation
    </div>

    <div class="viewport-toast-wrap">
      <Transition name="toast">
        <div v-if="toastMessage" class="viewport-toast">{{ toastMessage }}</div>
      </Transition>
    </div>

    <ClientOnly>
      <AnnotationsLayer
        v-if="annotations"
        :annotations="annotations"
        :markers-visible="markersVisible"
        :active-annotation-id="selectedAnnotationId"
        :project="project"
        :pending-point="pendingPoint"
        :pending-screen-x="pendingScreenX"
        :pending-screen-y="pendingScreenY"
        :create-mode="createMode"
        :restroom-slug="props.slug ?? ''"
        @select-annotation="selectAnnotation($event)"
        @close-active="selectAnnotation(null)"
        @submit-annotation="saveAnnotation($event)"
        @cancel-create="
          pendingPoint = null;
          pendingSnapshot = null;
          createMode = false;
        "
      />
    </ClientOnly>

    <div v-if="loading" class="loading-overlay">
      <img src="/toilet-loader.gif" alt="Loading..." width="200" height="200" />
    </div>
    <div v-else-if="error" class="status error">{{ error }}</div>
  </div>
</template>

<style scoped>
.viewer {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
.viewer canvas {
  cursor: v-bind("createMode ? 'crosshair' : 'default'");
}
.overlay {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  pointer-events: none;
}
.overlay > * {
  pointer-events: auto;
}
.overlay-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* The three values the layout's nav buttons rebuild their height from, so the
   bottom row stays level on mobile. Changing them here moves both. */
/* Present only for the mobile stack below. Without a box of its own, its two
   groups sit in the desktop row exactly as they did before it existed. */
.ctrl-stack {
  display: contents;
}
.ctrl-group {
  display: flex;
  align-items: center;
  gap: 2px;
  background: none;
  border: var(--ctrl-group-border, 1px) solid #fff;
  border-radius: 999px;
  padding: var(--ctrl-group-pad-y, 4px) 5px;
}
.ctrl-btn {
  width: var(--ctrl-btn-size, 26px);
  height: var(--ctrl-btn-size, 26px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: #000000;
  padding: 0;
  transition:
    background 0.12s,
    color 0.12s;
}
.ctrl-btn:hover {
  color: #666;
}
.ctrl-btn.active {
  background: #000;
  color: #fff;
}
.ctrl-add {
  background: transparent;
  border: 1px solid #fff;
}
.ctrl-add:hover {
  background: rgba(255, 255, 255, 0.15);
}
.ctrl-add.active,
.ctrl-crop.active {
  background: #ff0000;
  color: #ffffff;
}
.ctrl-btn:disabled {
  cursor: default;
  opacity: 0.6;
}
/* Hidden but still holding its space; see the template for why. */
.annotation-group.is-concealed {
  visibility: hidden;
}
.crop-note {
  letter-spacing: 0.06em;
}
.crop-note-warn {
  color: #ff0000;
  letter-spacing: normal;
}
.ctrl-toggle {
  display: flex;
  align-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0 5px;
}
.toggle-track {
  width: 28px;
  height: 16px;
  background: none;
  border: 1px solid #fff;
  border-radius: 8px;
  position: relative;
  transition: background 0.15s;
}
.ctrl-toggle.active .toggle-track {
  background: #ff0000;
}
.toggle-thumb {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: left 0.15s;
}
.ctrl-toggle.active .toggle-thumb {
  left: 14px;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10;
  pointer-events: none;
}
.status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  pointer-events: none;
}
.status.error {
  color: #ff6b6b;
}
.crosshair-hint {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background: none;
  color: #fff;
  border: 1px solid #fff;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 3px;
  font-family: Arial, Helvetica, sans-serif;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
}
.viewport-toast-wrap {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 4;
}
.viewport-toast {
  background: none;
  color: #fff;
  border: 1px solid #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 3px;
  white-space: nowrap;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 750px) {
  .overlay {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    align-items: flex-start;
    padding: 0.75rem;
    z-index: 4;
  }
  /* Bottom row: view-mode pill hugs the left, annotations the right. The row
  spans the full width, so it stays transparent to pointer events in the middle
  where the layout's bottom nav sits. */
  .overlay-right {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    right: 0.75rem;
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    pointer-events: none;
  }
  .overlay-right > * {
    pointer-events: auto;
  }
  /* The same buttons as the desktop row, stacked up the left-hand edge: view
  mode at the bottom, level with the annotation toggle, then crop, then the
  tool's mode and reset buttons above it while it is open. They grow upward
  from crop, away from the corner, so neither view mode nor crop moves when
  the tool opens. The DOM order is the desktop one, so `order` sets the stack's
  and column-reverse lays it bottom up. The stack is transparent to pointer
  events like the row around it, so the gaps between buttons do not swallow
  touches meant for the scan. */
  .ctrl-stack {
    display: flex;
    flex-direction: column-reverse;
    align-items: flex-start;
    gap: 8px;
    margin-right: auto;
    pointer-events: none;
  }
  .ctrl-stack > * {
    pointer-events: auto;
  }
  .ctrl-stack > .view-mode-group {
    order: 0;
  }
  .ctrl-stack > .crop-group {
    order: 1;
  }
  .ctrl-stack > .crop-mode-group {
    order: 2;
  }
  .ctrl-stack > .crop-reset-group {
    order: 3;
  }
  .annotation-group {
    margin-left: auto;
  }
  .crosshair-hint {
    top: 2.75rem;
  }
  .viewport-toast-wrap {
    top: 2.75rem;
  }
}
</style>
