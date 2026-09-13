<script setup lang="ts">
/**
 * The controls beside the crop gizmo.
 *
 * Deliberately thin: the box itself is dragged in the scene, so this is only
 * the things the 3D surface cannot say. It reads the draft box rather than
 * owning it, because the gizmo is the source of truth while an edit is open.
 */
import type { CropBox } from "~~/shared/utils/crop";
import type { Annotation } from "~/types/annotation";

const props = defineProps<{
  /** The box as currently dragged, in model-local space. */
  draft: CropBox | null;
  /** Whether a save is in flight. */
  saving: boolean;
  /** Annotations on this entry, for the out-of-box warning. */
  annotations: Annotation[] | null;
  error: string;
}>();

defineEmits<{ reset: []; cancel: []; save: [] }>();

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
 * How many annotations sit outside the box as drawn.
 *
 * A warning rather than a block. Cropping away an annotated surface is a
 * legitimate thing to do (the annotation may be on the very junk being
 * removed), and the annotation itself survives either way: only its marker
 * stops having a surface to sit on. What the admin needs is to know before
 * saving rather than to be stopped.
 *
 * Annotation points are stored in model-local space, the same space the crop
 * box is in, so this is a direct comparison with nothing to transform.
 */
const strandedCount = computed(() => {
  const d = props.draft;
  if (!d || !props.annotations?.length) return 0;
  return props.annotations.filter(
    (a) =>
      a.pointX < d.minX ||
      a.pointX > d.maxX ||
      a.pointY < d.minY ||
      a.pointY > d.maxY ||
      a.pointZ < d.minZ ||
      a.pointZ > d.maxZ,
  ).length;
});
</script>

<template>
  <div class="crop-panel">
    <div class="crop-head">
      <span class="crop-title">Crop</span>
      <span v-if="dimensions" class="crop-dims">{{ dimensions }}</span>
    </div>

    <p class="crop-hint">Drag a face to trim. Drag elsewhere to orbit.</p>

    <p v-if="strandedCount" class="crop-warn">
      {{ strandedCount }}
      {{ strandedCount === 1 ? "annotation falls" : "annotations fall" }}
      outside this box.
    </p>

    <p v-if="error" class="crop-warn">{{ error }}</p>

    <div class="crop-actions">
      <button type="button" class="crop-btn" @click="$emit('reset')">
        Reset
      </button>
      <button type="button" class="crop-btn" @click="$emit('cancel')">
        Cancel
      </button>
      <button
        type="button"
        class="crop-btn crop-save"
        :disabled="saving"
        @click="$emit('save')"
      >
        {{ saving ? "Saving…" : "Save crop" }}
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
  max-width: min(260px, calc(100% - 1.5rem));
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

.crop-hint {
  margin: 6px 0 0;
  color: #999;
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

.crop-save:hover:not(:disabled) {
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
