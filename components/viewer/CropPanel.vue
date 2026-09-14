<script setup lang="ts">
/**
 * The controls beside the crop gizmo.
 *
 * Deliberately thin: the box itself is dragged in the scene, so this is only
 * what the 3D surface cannot say. It reads the draft box rather than owning it,
 * because the gizmo is the source of truth while an edit is open.
 *
 * There is no Cancel button. The viewer's crop button toggles the tool off and
 * Escape does the same, so a third way out would be one control more than the
 * job needs.
 */
import type { CropBox, CropMode } from "~~/shared/utils/crop";
import type { Annotation } from "~/types/annotation";

const props = defineProps<{
  /** The box as currently dragged, in model-local space. */
  draft: CropBox | null;
  /** Which side of the box survives. */
  mode: CropMode;
  /** Whether the box as drawn would leave no scan behind. */
  emptiesScan: boolean;
  /** The POV eye's height above the frame's floor, or null before it is known. */
  povHeight: number | null;
  /** Whether a save is in flight. */
  saving: boolean;
  /** Annotations on this entry, for the out-of-box warning. */
  annotations: Annotation[] | null;
  error: string;
}>();

defineEmits<{ reset: []; confirm: []; mode: [CropMode] }>();

/**
 * The box's dimensions, in the units the scan was captured in.
 *
 * Photogrammetry exports metres, so these read as metres, but nothing verifies
 * that and a scan authored in another unit would be labelled wrongly. The
 * number is here to help judge a drag rather than to be quoted, so it is shown
 * without a unit.
 */
const dimensions = computed(() => {
  const d = props.draft;
  if (!d) return null;
  const round = (n: number) => n.toFixed(2);
  return `${round(d.maxX - d.minX)} × ${round(d.maxY - d.minY)} × ${round(d.maxZ - d.minZ)}`;
});

/**
 * How many annotations sit on geometry this crop would take away.
 *
 * Which side that is depends on the mode, so the same test answers both.
 * Annotation points are stored in model-local space, the same space the box is
 * in, so it is a direct comparison with nothing to transform.
 *
 * A warning rather than a block: cropping away an annotated surface is a
 * legitimate thing to do, and the annotation itself survives either way. Only
 * its marker stops having anything to sit on.
 */
const strandedCount = computed(() => {
  const d = props.draft;
  if (!d || !props.annotations?.length) return 0;
  return props.annotations.filter((a) => {
    const inside =
      a.pointX >= d.minX &&
      a.pointX <= d.maxX &&
      a.pointY >= d.minY &&
      a.pointY <= d.maxY &&
      a.pointZ >= d.minZ &&
      a.pointZ <= d.maxZ;
    return props.mode === "keep" ? !inside : inside;
  }).length;
});
</script>

<template>
  <div class="crop-panel">
    <div class="crop-head">
      <span class="crop-title">Crop</span>
      <span v-if="dimensions" class="crop-dims">{{ dimensions }}</span>
    </div>

    <div class="crop-modes" role="group" aria-label="What the box does">
      <button
        type="button"
        class="crop-mode"
        :class="{ active: mode === 'keep' }"
        :aria-pressed="mode === 'keep'"
        title="Keep what is inside the box"
        @click="$emit('mode', 'keep')"
      >
        + Keep inside
      </button>
      <button
        type="button"
        class="crop-mode"
        :class="{ active: mode === 'remove' }"
        :aria-pressed="mode === 'remove'"
        title="Remove what is inside the box"
        @click="$emit('mode', 'remove')"
      >
        − Remove inside
      </button>
    </div>

    <p class="crop-hint">
      {{
        mode === "keep"
          ? "Everything outside the box is trimmed."
          : "Everything inside the box is deleted."
      }}
      Drag a face to resize, drag elsewhere to orbit.
    </p>

    <!-- A readout, not a control: the eye is set by dragging its dot on the
    centre line, and this says where it has got to. -->
    <p v-if="povHeight != null" class="crop-pov">
      <span>POV eye height</span>
      <span class="crop-dims">{{ povHeight.toFixed(2) }}</span>
    </p>
    <p v-if="povHeight != null" class="crop-hint">
      Drag the dot on the centre line to raise or lower it.
    </p>

    <p v-if="emptiesScan" class="crop-warn">
      This box covers the whole scan, so nothing would be left.
    </p>
    <p v-else-if="strandedCount" class="crop-warn">
      {{ strandedCount }}
      {{ strandedCount === 1 ? "annotation sits" : "annotations sit" }}
      on geometry this removes.
    </p>

    <p v-if="error" class="crop-warn">{{ error }}</p>

    <div class="crop-actions">
      <button type="button" class="crop-btn" @click="$emit('reset')">
        Reset
      </button>
      <button
        type="button"
        class="crop-btn crop-confirm"
        :disabled="saving || emptiesScan"
        @click="$emit('confirm')"
      >
        {{ saving ? "Saving…" : "Confirm" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Top centre, the one edge of the viewer nothing else holds while cropping.
   The top left has the catalog's collapse tab reaching 18px into it, and the
   site title when the catalog is closed; the top right has the viewer's own
   controls. The toast and the annotation hint share this spot, but neither is
   on screen with the panel: the hint belongs to annotation mode, which cropping
   switches off, and the toasts follow the panel closing. */
.crop-panel {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: max-content;
  max-width: min(280px, calc(100% - 1.5rem));
  padding: 8px 10px;
  border: 1px solid #fff;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  line-height: 1.35;
}

.crop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.crop-title {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.crop-dims {
  color: #999;
  font-variant-numeric: tabular-nums;
}

/* One bordered block split in two, like the account page's segmented sub-tabs:
   the two are one choice, not two buttons. */
.crop-modes {
  display: flex;
  margin-top: 8px;
  border: 1px solid #fff;
  border-radius: 3px;
  overflow: hidden;
}

.crop-mode {
  flex: 1;
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.crop-mode + .crop-mode {
  border-left: 1px solid #fff;
}

.crop-mode:hover:not(.active) {
  background: rgba(255, 255, 255, 0.15);
}

.crop-mode.active {
  background: #fff;
  color: #000;
}

.crop-hint {
  margin: 6px 0 0;
  color: #999;
}

.crop-pov {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 0 0;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.25);
}

.crop-warn {
  margin: 6px 0 0;
  color: #ff0000;
}

.crop-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.crop-btn {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid #fff;
  border-radius: 3px;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.crop-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.crop-confirm:hover:not(:disabled) {
  background: #ff0000;
  border-color: #ff0000;
}

.crop-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* On the mobile sheet the viewer's own controls move to the bottom row, so the
   panel keeps the top edge but clears the sheet's grabber. */
@media (max-width: 750px) {
  .crop-panel {
    top: 2.75rem;
    left: 0.75rem;
    right: 0.75rem;
    transform: none;
    width: auto;
    max-width: none;
  }
}
</style>
