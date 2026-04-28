<script setup lang="ts">
import * as THREE from "three";
import { useThreeScene } from "~/composables/useThreeScene";
import type { CameraSnapshot } from "~/composables/useThreeScene";

const props = defineProps<{
  modelUrl?: string | null;
  slug?: string | null;
  thumbUrl?: string | null;
}>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const modelUrlRef = toRef(props, "modelUrl");
const slugRef = toRef(props, "slug");

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
  setMode,
  flyTo,
  project,
  captureThumb,
} = useThreeScene(canvasRef, modelUrlRef, handlePickPoint);

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

// Transient toast describing the last viewport-button action
const toastMessage = ref("");
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string) {
  toastMessage.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = "";
    toastTimer = null;
  }, 1200);
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
    if (pendingPoint.value) {
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
      <div class="overlay-left" />

      <div class="overlay-right">
        <!-- View mode: single circle that changes icon -->
        <div class="ctrl-group">
          <button
            class="ctrl-btn"
            :title="
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

        <!-- Annotation controls: toggle always visible; add button signed-in users only -->
        <div class="ctrl-group">
          <button
            class="ctrl-toggle"
            :class="{ active: markersVisible }"
            title="Show annotations"
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

    <div v-if="createMode && !pendingPoint" class="crosshair-hint">
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
  justify-content: space-between;
  gap: 10px;
  pointer-events: none;
}
.overlay > * {
  pointer-events: auto;
}
.overlay-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.overlay-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ctrl-group {
  display: flex;
  align-items: center;
  gap: 2px;
  background: none;
  border: 1px solid #fff;
  border-radius: 999px;
  padding: 4px 5px;
}
.ctrl-btn {
  width: 26px;
  height: 26px;
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
  /* background: rgba(0, 0, 0, 0.08); */
  color: #666;
}
.ctrl-btn.active {
  background: #000;
  color: #fff;
}
.ctrl-add {
  background: #000;
  border: 1px solid #fff;
}
.ctrl-add:hover {
  background: rgba(255, 255, 255, 0.15);
}
.ctrl-add.active {
  background: #ff0000;
  color: #ffffff;
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
  .overlay-right {
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: auto;
  }
}
</style>
