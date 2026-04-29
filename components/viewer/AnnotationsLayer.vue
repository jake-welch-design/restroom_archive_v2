<script setup lang="ts">
import * as THREE from "three";
import type { Annotation } from "~/types/annotation";
import type { CameraSnapshot } from "~/composables/useThreeScene";

const props = defineProps<{
  annotations: Annotation[];
  markersVisible: boolean;
  activeAnnotationId: number | null;
  project: (point: THREE.Vector3) => { x: number; y: number; inFront: boolean };
  pendingPoint: THREE.Vector3 | null;
  pendingScreenX: number;
  pendingScreenY: number;
  createMode: boolean;
}>();

const emit = defineEmits<{
  selectAnnotation: [id: number];
  closeActive: [];
  submitAnnotation: [body: string];
  cancelCreate: [];
}>();

// Reactive projected positions — recomputed every animation frame
const positions = ref<Map<number, { x: number; y: number; inFront: boolean }>>(
  new Map(),
);

let frameId = 0;
function tick() {
  const m = new Map<number, { x: number; y: number; inFront: boolean }>();
  for (const a of props.annotations) {
    m.set(a.id, props.project(new THREE.Vector3(a.pointX, a.pointY, a.pointZ)));
  }
  positions.value = m;
  frameId = requestAnimationFrame(tick);
}

onMounted(() => {
  frameId = requestAnimationFrame(tick);
});
onBeforeUnmount(() => cancelAnimationFrame(frameId));

// Compose form
const composeBody = ref("");

function onSave() {
  if (!composeBody.value.trim()) return;
  emit("submitAnnotation", composeBody.value.trim());
  composeBody.value = "";
}

function onCancel() {
  composeBody.value = "";
  emit("cancelCreate");
}

// Close active bubble / cancel pending on outside click
function onLayerClick(e: MouseEvent) {
  if (
    (e.target as HTMLElement).closest(
      ".annotation-dot, .chat-bubble, .compose-popup",
    )
  )
    return;
  if (props.pendingPoint) {
    emit("cancelCreate");
    return;
  }
  emit("closeActive");
}

const activeAnnotation = computed(() =>
  props.activeAnnotationId != null
    ? (props.annotations.find((a) => a.id === props.activeAnnotationId) ?? null)
    : null,
);

const activePos = computed(() =>
  props.activeAnnotationId != null
    ? (positions.value.get(props.activeAnnotationId) ?? null)
    : null,
);

const pendingPos = computed(() => {
  if (!props.pendingPoint) return null;
  return props.project(props.pendingPoint);
});
</script>

<template>
  <div
    class="layer"
    :class="{ 'capture-clicks': !!pendingPoint }"
    @click="onLayerClick"
  >
    <!-- Markers -->
    <template v-if="markersVisible">
      <button
        v-for="a in annotations"
        :key="a.id"
        type="button"
        class="annotation-dot"
        :class="{ active: a.id === activeAnnotationId }"
        :aria-label="`Annotation by ${a.author.displayName ?? '@' + a.author.username}: ${a.body}`"
        :style="{
          left: `${positions.get(a.id)?.x ?? 0}px`,
          top: `${positions.get(a.id)?.y ?? 0}px`,
          display: positions.get(a.id)?.inFront ? 'block' : 'none',
        }"
        @click.stop="emit('selectAnnotation', a.id)"
      >
        <div class="tooltip" aria-hidden="true">{{ a.body }}</div>
      </button>
    </template>

    <!-- Active chat bubble -->
    <div
      v-if="activeAnnotation && activePos?.inFront"
      class="chat-bubble"
      :style="{
        left: `${(activePos?.x ?? 0) + 14}px`,
        top: `${(activePos?.y ?? 0) - 8}px`,
      }"
    >
      <button
        type="button"
        class="bubble-close"
        aria-label="Close annotation"
        @click.stop="emit('closeActive')"
      >
        ×
      </button>
      <p class="bubble-body">{{ activeAnnotation.body }}</p>
      <span class="bubble-meta">
        {{
          activeAnnotation.author.displayName ?? `@${activeAnnotation.author.username}`
        }}
      </span>
    </div>

    <!-- Pending point indicator -->
    <div
      v-if="pendingPoint && pendingPos?.inFront"
      class="annotation-dot pending"
      :style="{
        left: `${pendingPos.x}px`,
        top: `${pendingPos.y}px`,
      }"
    />

    <!-- Compose popup -->
    <div
      v-if="pendingPoint"
      class="compose-popup"
      :style="{
        left: `${pendingScreenX + 14}px`,
        top: `${pendingScreenY - 8}px`,
      }"
      @click.stop
    >
      <textarea
        v-model="composeBody"
        class="compose-textarea"
        placeholder="Add a note…"
        maxlength="500"
        rows="3"
        autofocus
        @keydown.esc.stop="onCancel"
      />
      <div class="compose-actions">
        <button
          type="button"
          class="compose-save"
          :disabled="!composeBody.trim()"
          @click="onSave"
        >
          Save
        </button>
        <button type="button" class="compose-cancel" @click="onCancel">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.layer.capture-clicks {
  pointer-events: auto;
}

.annotation-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  background: rgb(255, 0, 0);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  pointer-events: all;
  border: none;
  padding: 0;
}
.annotation-dot.active {
  background: rgb(255, 83, 83);
}
.annotation-dot.pending {
  background: #e33;
  opacity: 0.6;
  pointer-events: none;
}

.tooltip {
  display: none;
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  white-space: nowrap;
  padding: 3px 7px;
  border-radius: 3px;
  pointer-events: none;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.annotation-dot:hover .tooltip {
  display: block;
}

.chat-bubble {
  position: absolute;
  background: #fff;
  border: 1px solid #000;
  padding: 10px 12px;
  width: 220px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  pointer-events: all;
  z-index: 3;
}
.bubble-close {
  position: absolute;
  top: 4px;
  right: 6px;
  background: transparent;
  border: 0;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  color: #999;
  line-height: 1;
  padding: 0;
}
.bubble-close:hover {
  color: #000;
}
.bubble-body {
  margin: 0 0 4px;
  color: #000;
  line-height: 1.4;
  padding-right: 14px;
}
.bubble-meta {
  font-size: 11px;
  color: #999;
}

.compose-popup {
  position: absolute;
  background: #fff;
  border: 1px solid #000;
  padding: 10px 12px;
  width: 220px;
  pointer-events: all;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: Arial, Helvetica, sans-serif;
}
.compose-textarea {
  border: 1px solid #ccc;
  padding: 5px 6px;
  font: inherit;
  font-size: 13px;
  resize: none;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.compose-textarea:focus {
  border-color: #000;
}
.compose-actions {
  display: flex;
  gap: 8px;
}
.compose-save {
  background: #000;
  color: #fff;
  border: 0;
  padding: 5px 14px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.compose-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.compose-cancel {
  background: transparent;
  border: 1px solid #ccc;
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.compose-cancel:hover {
  border-color: #000;
}
</style>
