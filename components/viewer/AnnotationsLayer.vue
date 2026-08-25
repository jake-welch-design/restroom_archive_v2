<script setup lang="ts">
import * as THREE from "three";
import type { Annotation } from "~/types/annotation";

const props = defineProps<{
  annotations: Annotation[];
  markersVisible: boolean;
  activeAnnotationId: number | null;
  project: (point: THREE.Vector3) => { x: number; y: number; inFront: boolean };
  pendingPoint: THREE.Vector3 | null;
  pendingScreenX: number;
  pendingScreenY: number;
  createMode: boolean;
  restroomSlug: string;
}>();

const emit = defineEmits<{
  selectAnnotation: [id: number];
  closeActive: [];
  submitAnnotation: [body: string];
  cancelCreate: [];
}>();

const { user, loggedIn } = useAuth();
const confirmingReportId = ref<number | null>(null);
const reportedIds = ref<Set<number>>(new Set());
const reportError = ref("");

function isOwnAnnotation(authorId: number): boolean {
  const u = user.value as { id?: number } | null;
  return !!u && u.id === authorId;
}

function startReport(id: number) {
  reportError.value = "";
  confirmingReportId.value = id;
}

function cancelReport() {
  confirmingReportId.value = null;
  reportError.value = "";
}

async function confirmReport(id: number) {
  reportError.value = "";
  try {
    await $fetch(
      `/api/restrooms/${props.restroomSlug}/annotations/${id}/report`,
      {
        method: "POST",
      },
    );
    reportedIds.value.add(id);
    confirmingReportId.value = null;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    reportError.value = err.data?.statusMessage ?? "Could not submit report.";
  }
}

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
          activeAnnotation.author.displayName ??
          `@${activeAnnotation.author.username}`
        }}
      </span>
      <template v-if="loggedIn && !isOwnAnnotation(activeAnnotation.author.id)">
        <div
          v-if="confirmingReportId === activeAnnotation.id"
          class="bubble-report-confirm"
          @click.stop
        >
          <template v-if="reportError">
            <span class="bubble-report-error">{{ reportError }}</span>
            <button
              type="button"
              class="bubble-report-no"
              @click.stop="cancelReport"
            >
              Close
            </button>
          </template>
          <template v-else>
            <span class="bubble-report-prompt">Report this?</span>
            <button
              type="button"
              class="bubble-report-yes"
              @click.stop="confirmReport(activeAnnotation.id)"
            >
              Yes
            </button>
            <button
              type="button"
              class="bubble-report-no"
              @click.stop="cancelReport"
            >
              Cancel
            </button>
          </template>
        </div>
        <button
          v-else-if="!reportedIds.has(activeAnnotation.id)"
          type="button"
          class="bubble-report-btn"
          aria-label="Report this annotation"
          title="Report this annotation"
          @click.stop="startReport(activeAnnotation.id)"
        >
          !
        </button>
        <span v-else class="bubble-reported">Reported</span>
      </template>
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
  background: #e33;
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
.bubble-report-btn {
  position: absolute;
  bottom: 4px;
  right: 6px;
  background: transparent;
  border: 1px solid #bbb;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  padding: 0;
  font: inherit;
  font-size: 8px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bubble-report-btn:hover {
  color: #c33;
  border-color: #c33;
}
.bubble-report-confirm {
  position: absolute;
  bottom: 4px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.bubble-report-prompt {
  color: #666;
}
.bubble-report-error {
  color: #c33;
  font-size: 10px;
  max-width: 110px;
  white-space: normal;
  line-height: 1.2;
}
.bubble-report-yes,
.bubble-report-no {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}
.bubble-report-yes {
  color: #c33;
}
.bubble-report-no {
  color: #999;
}
.bubble-reported {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 11px;
  color: #999;
  font-style: italic;
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
