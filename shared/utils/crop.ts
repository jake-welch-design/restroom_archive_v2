/**
 * The admin-drawn crop, shared because both sides of it have to agree.
 *
 * The viewer applies it, the save endpoint stores it, and the read endpoints
 * hand it back. Lives in shared/ for the same reason rejection.ts does: the
 * axis naming, the two modes and the difference between the two boxes are a
 * single contract, and two copies of it would drift.
 */

/**
 * A box in the GLB's own local space.
 *
 * Local rather than the viewer's centred world space, deliberately. The viewer
 * centres a model by subtracting its frame centre, so world space is defined by
 * whichever crop is applied. Storing boxes in world space would make a second
 * edit compose with the first's offset and walk the box off the model.
 */
export interface CropBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Which side of the box survives.
 *
 * `keep` trims everything outside the box, for pulling the view in on the room.
 * `remove` deletes what is inside it, which is the one that suits the usual
 * job: a floating fragment metres from the room, boxed and dropped.
 */
export type CropMode = "keep" | "remove";

export interface Crop {
  mode: CropMode;
  /** What the admin drew, and what the clipping planes cut against. */
  box: CropBox;
  /**
   * What the viewer centres and frames on.
   *
   * In `keep` mode this is the box itself. In `remove` mode it cannot be: the
   * box is the part being thrown away, and centring the viewer on the hole
   * would be exactly wrong. There it is the bounding box of the geometry that
   * survives, measured once when the crop is saved because measuring it means
   * walking every vertex, which is not something to ask of every visitor on
   * every load.
   */
  frame: CropBox;
}

/** How a crop shifts the model's centre, and with it the viewer's world space. */
export interface CropDelta {
  x: number;
  y: number;
  z: number;
}

/**
 * Smallest a box axis may get, in model units (metres, for these scans).
 *
 * Guards the degenerate box rather than the useless one: at zero thickness the
 * viewer's `maxDim` collapses, which takes the camera distance, the near/far
 * planes and `controls.minDistance` down with it and leaves the viewer with no
 * step size at all.
 */
export const MIN_CROP_SIZE = 0.05;

const AXES = ["minX", "minY", "minZ", "maxX", "maxY", "maxZ"] as const;

function isBox(value: unknown): value is CropBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Record<string, unknown>;
  return AXES.every(
    (k) => typeof box[k] === "number" && Number.isFinite(box[k]),
  );
}

/**
 * The stored column as a crop, or null when there is none.
 *
 * Stored as JSON in one column rather than as a dozen REAL columns because the
 * shape is compound: a mode and two boxes that only mean anything together.
 * `restrooms.descriptors` sets the precedent for serialising a structure this
 * way. Lenient like `parseDescriptors`: anything unreadable reads as no crop,
 * so a bad row shows the whole scan rather than breaking the viewer.
 */
export function parseCrop(value: string | null | undefined): Crop | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const mode = parsed.mode === "remove" ? "remove" : "keep";
    if (!isBox(parsed.box)) return null;
    // Tolerated for a row written before `frame` existed, and for `keep`, where
    // the frame is the box by definition.
    const frame = isBox(parsed.frame) ? parsed.frame : parsed.box;
    return { mode, box: parsed.box, frame };
  } catch {
    return null;
  }
}

export function serializeCrop(crop: Crop | null): string | null {
  return crop ? JSON.stringify(crop) : null;
}
