<script setup lang="ts">
import type * as THREE from "three";
import type { RoomMeasurement } from "~/composables/roomMeasure";

export interface ProjectedLabel {
  x: number;
  y: number;
  /** Unit screen direction from the line toward the room's outside. */
  nx: number;
  ny: number;
  visible: boolean;
}

const props = defineProps<{
  measurement: RoomMeasurement | null;
  visible: boolean;
  projectSegment: (
    start: THREE.Vector3,
    end: THREE.Vector3,
    outward: THREE.Vector3,
  ) => ProjectedLabel;
}>();

/** Space between a line and the nearest edge of its label, in px. */
const LABEL_GAP_PX = 5;

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
    (!b.visible ||
      (Math.abs(a.x - b.x) < 0.1 &&
        Math.abs(a.y - b.y) < 0.1 &&
        Math.abs(a.nx - b.nx) < 0.01 &&
        Math.abs(a.ny - b.ny) < 0.01))
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
      const p = props.projectSegment(seg.start, seg.end, seg.outward);
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

/**
 * Places a label just outside its line. The anchor sits LABEL_GAP_PX off the
 * line along the outward normal, and the label shifts by half its own size
 * along that normal (scaled so its nearest edge or corner meets the anchor),
 * so it clears the line at any angle without measuring the text.
 */
function labelStyle(id: string) {
  const p = labelPositions.value.get(id);
  if (!p || !p.visible) {
    return { display: "none" };
  }
  const reach = Math.max(Math.abs(p.nx), Math.abs(p.ny)) || 1;
  const sx = p.nx / reach;
  const sy = p.ny / reach;
  return {
    left: `${p.x + p.nx * LABEL_GAP_PX}px`,
    top: `${p.y + p.ny * LABEL_GAP_PX}px`,
    transform: `translate(${-50 + sx * 50}%, ${-50 + sy * 50}%)`,
  };
}

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
      :style="labelStyle(seg.id)"
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
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  white-space: nowrap;
  /* No backing box: a tight shadow keeps the text readable on pale scans. */
  text-shadow:
    0 0 2px rgba(0, 0, 0, 0.9),
    0 1px 3px rgba(0, 0, 0, 0.7);
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
  }
  .measure-area {
    font-size: 12px;
  }
}
</style>
