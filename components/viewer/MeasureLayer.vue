<script setup lang="ts">
import type * as THREE from "three";
import type { RoomMeasurement } from "~/composables/roomMeasure";

export interface ProjectedLabel {
  x: number;
  y: number;
  visible: boolean;
}

const props = defineProps<{
  measurement: RoomMeasurement | null;
  visible: boolean;
  projectSegment: (start: THREE.Vector3, end: THREE.Vector3) => ProjectedLabel;
}>();

// Projected edge-label positions, updated on animation frames only when
// visible labels actually move so a stationary camera causes zero Vue updates.
const labelPositions = shallowRef<Map<string, ProjectedLabel>>(new Map());

function sameLabelPos(
  a: ProjectedLabel | undefined,
  b: ProjectedLabel,
): boolean {
  return (
    !!a &&
    a.visible === b.visible &&
    (!b.visible || (Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1))
  );
}

let frameId = 0;
function tick() {
  const m = props.measurement;
  if (!props.visible || !m || m.segments.length === 0) {
    if (labelPositions.value.size > 0) labelPositions.value = new Map();
  } else {
    const prev = labelPositions.value;
    let changed = prev.size !== m.segments.length;
    const next = new Map<string, ProjectedLabel>();
    for (const seg of m.segments) {
      const p = props.projectSegment(seg.start, seg.end);
      next.set(seg.id, p);
      if (!changed && !sameLabelPos(prev.get(seg.id), p)) changed = true;
    }
    if (changed) labelPositions.value = next;
  }
  frameId = requestAnimationFrame(tick);
}

onMounted(() => {
  frameId = requestAnimationFrame(tick);
});
onBeforeUnmount(() => cancelAnimationFrame(frameId));

const areaText = computed(() => {
  if (!props.measurement) return "";
  return `${props.measurement.areaSqFt.toFixed(1)} sq ft`;
});
</script>

<template>
  <div v-if="visible && measurement" class="measure-layer" aria-hidden="true">
    <span
      v-for="seg in measurement.segments"
      :key="seg.id"
      class="measure-label"
      :class="seg.kind"
      :style="{
        left: `${labelPositions.get(seg.id)?.x ?? 0}px`,
        top: `${labelPositions.get(seg.id)?.y ?? 0}px`,
        display: labelPositions.get(seg.id)?.visible ? 'inline-block' : 'none',
      }"
    >
      {{ seg.label }}
    </span>

    <div class="measure-area" aria-live="polite">
      {{ areaText }}
    </div>
  </div>
</template>

<style scoped>
.measure-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  overflow: hidden;
}

.measure-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.72);
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.32);
}

.measure-label.vertical {
  border-color: rgba(34, 197, 94, 0.65);
}

.measure-area {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

@media (max-width: 750px) {
  .measure-label {
    font-size: 10px;
    padding: 1px 4px;
  }
  .measure-area {
    font-size: 12px;
  }
}
</style>
