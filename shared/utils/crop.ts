/**
 * The admin-drawn crop box, shared because both sides of it have to agree.
 *
 * The viewer applies the box, the save endpoint stores it, and the read
 * endpoints hand it back. Lives in shared/ for the same reason rejection.ts
 * does: the axis naming and the "all six or none" rule are a single contract,
 * and two copies of it would eventually disagree about what a half-populated
 * row means.
 */

/**
 * A crop box in the GLB's own local space.
 *
 * Local rather than the viewer's centred world space, deliberately. The viewer
 * centres a model by subtracting its box centre, so world space is defined by
 * whichever box was applied at load. Storing the crop in world space would make
 * a second edit compose with the first's offset and walk the box off the model.
 */
export interface CropBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** How a crop shifts the model's centre, and with it the viewer's world space. */
export interface CropDelta {
  x: number;
  y: number;
  z: number;
}

/**
 * The columns as they come off a `restrooms` row.
 *
 * Drizzle types the six as `number | null` independently, so this is the shape
 * every caller actually has rather than the shape it wants.
 */
export interface CropColumns {
  cropMinX: number | null;
  cropMinY: number | null;
  cropMinZ: number | null;
  cropMaxX: number | null;
  cropMaxY: number | null;
  cropMaxZ: number | null;
}

/**
 * Smallest a cropped axis may get, in model units (metres, for these scans).
 *
 * Guards the degenerate box rather than the useless one: at zero thickness the
 * viewer's `maxDim` collapses, which takes the camera distance, the near/far
 * planes and `controls.minDistance` down with it and leaves the viewer with no
 * step size at all. An admin who wants to crop a scan into nothing is not the
 * case being protected against.
 */
export const MIN_CROP_SIZE = 0.05;

/**
 * The six columns as a box, or null when the entry has no crop.
 *
 * Treats a partially populated row as no crop. Nothing writes one -- the save
 * endpoint sets all six or clears all six -- so reaching this branch means the
 * data is wrong, and falling back to the scan's own bounds shows the whole
 * model rather than framing it on a box with a NULL edge.
 */
export function cropFromColumns(row: CropColumns): CropBox | null {
  const { cropMinX, cropMinY, cropMinZ, cropMaxX, cropMaxY, cropMaxZ } = row;
  if (
    cropMinX == null ||
    cropMinY == null ||
    cropMinZ == null ||
    cropMaxX == null ||
    cropMaxY == null ||
    cropMaxZ == null
  )
    return null;

  return {
    minX: cropMinX,
    minY: cropMinY,
    minZ: cropMinZ,
    maxX: cropMaxX,
    maxY: cropMaxY,
    maxZ: cropMaxZ,
  };
}
