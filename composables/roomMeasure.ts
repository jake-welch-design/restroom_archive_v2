import * as THREE from "three";
import { InstancedInterleavedBuffer } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Room space measurement: finds the flat surfaces a scan's room is made of
 * (floor, walls, ceilings, slopes, the sides of nooks), keeps the ones that
 * bound the room rather than furniture in it, and draws an edge wherever two
 * of them actually meet. Edges are therefore wherever the room really has a
 * corner, at whatever angle: a ceiling sloping under stairs meets its walls on
 * a diagonal, and a window recess gets its own small frame at window height.
 *
 * Lazy-loaded when the visitor turns measurements on, for the same reason as
 * `cropGizmo.ts`: visitors who never open the tool pay for none of its
 * geometry or shaders.
 */

export interface MeasureSegment {
  id: string;
  /** Near-vertical edges are drawn green with longer dashes. */
  kind: "horizontal" | "vertical";
  start: THREE.Vector3;
  end: THREE.Vector3;
  lengthM: number;
  label: string;
  /**
   * Unit direction from the edge toward the side its label goes on, in
   * model-local space: out of the room at an inside corner, into the open at
   * an outside one (a window sill's front edge), so labels stay off the
   * surfaces they measure.
   */
  outward: THREE.Vector3;
}

export interface RoomMeasurement {
  /** Where edges end, deduplicated, for the corner markers. Model-local. */
  corners: THREE.Vector3[];
  /** Floor area in square metres. */
  areaM2: number;
  /** Floor area in square feet. */
  areaSqFt: number;
  segments: MeasureSegment[];
}

const SQM_TO_SQFT = 10.7639104167;

const WHITE = 0xffffff;
const GREEN = 0x00ff00;

const LINE_WIDTH_PX = 2.5;
const CORNER_SIZE_PX = 8;
const DASH_SIZE_M = 0.08;
const GAP_SIZE_M = 0.06;
/** Floor-to-ceiling runs are long and few, so they get longer dashes. */
const VERTICAL_DASH_SIZE_M = 0.2;
const VERTICAL_GAP_SIZE_M = 0.08;

/* --- Tuning --------------------------------------------------------------- */

/** Spacing of the points sampled across each triangle. */
const SAMPLE_SPACING_M = 0.04;
/** How far a triangle may sit off a plane and still belong to it (scan bumps). */
const PLANE_TOLERANCE_M = 0.03;
/** How far a triangle's normal may tilt from a plane's and still belong. */
const PLANE_ANGLE_COS = Math.cos((20 * Math.PI) / 180);
/** Planes within this of vertical or horizontal are made exactly so. */
const SNAP_SIN = Math.sin((4 * Math.PI) / 180);
/**
 * Smallest surface kept. A window recess's sill or side is around a tenth of a
 * square metre; scan noise and curved fixtures break into smaller pieces.
 */
const MIN_PATCH_AREA_M2 = 0.08;
/**
 * Narrowest surface kept. A scanned corner is rounded, and the rounding comes
 * out as a thin strip at an in-between angle running the corner's full length,
 * which would otherwise double every corner line. Door jambs and pipes go too.
 */
const MIN_PATCH_WIDTH_M = 0.1;
/**
 * Parallel room surfaces closer than this count as one: a door set back in
 * its frame, a tiled panel, a bulge in the scan. A window recess is deeper.
 */
const MERGE_OFFSET_M = 0.1;
/** Grid used to split one plane into its separate connected pieces. */
const PATCH_CELL_M = 0.05;
/** Two surfaces must meet at more than this angle to make an edge. */
const EDGE_MIN_ANGLE_COS = Math.cos((20 * Math.PI) / 180);
/**
 * How close each surface must come to the line where their planes cross.
 * Scanned corners are rounded over a few centimetres, so neither surface
 * reaches the true corner.
 */
const EDGE_NEAR_M = 0.08;
const EDGE_BIN_M = 0.04;
/** Gaps along an edge up to this many bins are bridged (scan holes). */
const EDGE_GAP_BINS = 3;
const MIN_EDGE_M = 0.12;
/**
 * Both surfaces must extend at least this far from an edge. Bumps, jambs and
 * the lip of a door frame meet the wall at a real angle but are too shallow to
 * be worth measuring.
 */
const EDGE_REACH_M = 0.12;
/** An edge end moves to a three-surface corner this close to it. */
const CORNER_SNAP_M = 0.2;
/**
 * Longest stretch of edge that may be bridged, or that an edge may be extended
 * across to its corner, when something standing in the room (a bin, a toilet,
 * a sink pedestal) hid it from the scanner.
 */
const BRIDGE_MAX_M = 1.0;
/**
 * How far into the room to look for that something: from clear of the two
 * surfaces themselves out to about the depth of a toilet.
 */
const BRIDGE_LOOK_FROM_M = 0.15;
const BRIDGE_LOOK_TO_M = 0.6;
/** Share of a stretch that must have something in front of it. */
const BRIDGE_HIDDEN_SHARE = 0.6;
/**
 * Surfaces at least this big stand in for the room's walls, floor and
 * ceilings when deciding what is furniture: something in front of one, inside
 * its outline, is in the room rather than part of it.
 */
const ENCLOSING_AREA_M2 = 0.5;
/** Grid for the "is anything in front of this surface's back" test. */
const VOXEL_M = 0.05;

/* --- Extraction ----------------------------------------------------------- */

/**
 * Measures the room in `model`'s local space from its surviving geometry
 * (`keep` and `removals` are the crop, in the same space). Falls back to the
 * edges of a box when no surfaces are found.
 */
export function extractRoomMeasurement(
  model: THREE.Object3D | null,
  options: {
    keep?: THREE.Box3 | null;
    removals?: THREE.Box3[];
    fallbackBox?: THREE.Box3;
  } = {},
): RoomMeasurement | null {
  const { keep = null, removals = [], fallbackBox } = options;
  if (!model) return null;

  const soup = collectTriangles(model, keep, removals);
  if (soup.count === 0) {
    return fallbackBox && !fallbackBox.isEmpty()
      ? boxMeasurement(fallbackBox)
      : null;
  }

  const patches = splitIntoPatches(soup, detectPlanes(soup));
  const facing = buildFacingGrid(patches, soup);
  const shell = mergeOffsetSurfaces(
    patches.filter((p) => boundsRoom(p, patches, facing)),
  );
  const edges = findEdges(shell, facing);
  snapCorners(edges, facing);
  const kept = edges.filter((e) => e.t1 - e.t0 >= MIN_EDGE_M);

  if (kept.length === 0) {
    return boxMeasurement(
      fallbackBox && !fallbackBox.isEmpty() ? fallbackBox : soup.bounds,
    );
  }

  const areaM2 = floorArea(shell);
  return {
    corners: dedupeCorners(kept),
    areaM2,
    areaSqFt: areaM2 * SQM_TO_SQFT,
    segments: kept.map(toSegment),
  };
}

/* Triangles ---------------------------------------------------------------- */

interface TriangleSoup {
  count: number;
  /** Nine floats per triangle: its three vertices. */
  verts: Float32Array;
  /** Unit face normal per triangle, from its winding (scans face the room). */
  normals: Float32Array;
  centroids: Float32Array;
  areas: Float32Array;
  bounds: THREE.Box3;
}

function collectTriangles(
  model: THREE.Object3D,
  keep: THREE.Box3 | null,
  removals: THREE.Box3[],
): TriangleSoup {
  model.updateMatrixWorld(true);
  const modelInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const toModel = new THREE.Matrix4();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const raw: number[] = [];

  // A triangle survives the crop when its centre does. Clamping straddlers to
  // the crop box, as the drawing does, would flatten them into fake planes.
  const survives = (p: THREE.Vector3): boolean => {
    if (keep && !keep.containsPoint(p)) return false;
    for (const box of removals) if (box.containsPoint(p)) return false;
    return true;
  };

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count === 0) return;
    toModel.multiplyMatrices(modelInverse, mesh.matrixWorld);
    const index = mesh.geometry.index;
    const triCount = Math.floor((index ? index.count : pos.count) / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      va.fromBufferAttribute(pos, i0).applyMatrix4(toModel);
      vb.fromBufferAttribute(pos, i1).applyMatrix4(toModel);
      vc.fromBufferAttribute(pos, i2).applyMatrix4(toModel);
      centroid
        .copy(va)
        .add(vb)
        .add(vc)
        .multiplyScalar(1 / 3);
      if (!survives(centroid)) continue;
      raw.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
    }
  });

  const total = raw.length / 9;
  const verts = new Float32Array(raw.length);
  const normals = new Float32Array(total * 3);
  const centroids = new Float32Array(total * 3);
  const areas = new Float32Array(total);
  const bounds = new THREE.Box3();
  let count = 0;

  for (let t = 0; t < total; t++) {
    const o = t * 9;
    const ax = raw[o];
    const ay = raw[o + 1];
    const az = raw[o + 2];
    const e1x = raw[o + 3] - ax;
    const e1y = raw[o + 4] - ay;
    const e1z = raw[o + 5] - az;
    const e2x = raw[o + 6] - ax;
    const e2y = raw[o + 7] - ay;
    const e2z = raw[o + 8] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) continue;
    for (let k = 0; k < 9; k++) verts[count * 9 + k] = raw[o + k];
    normals[count * 3] = nx / len;
    normals[count * 3 + 1] = ny / len;
    normals[count * 3 + 2] = nz / len;
    centroids[count * 3] = (raw[o] + raw[o + 3] + raw[o + 6]) / 3;
    centroids[count * 3 + 1] = (raw[o + 1] + raw[o + 4] + raw[o + 7]) / 3;
    centroids[count * 3 + 2] = (raw[o + 2] + raw[o + 5] + raw[o + 8]) / 3;
    areas[count] = len * 0.5;
    for (let k = 0; k < 9; k += 3) {
      bounds.expandByPoint(va.set(raw[o + k], raw[o + k + 1], raw[o + k + 2]));
    }
    count++;
  }

  return { count, verts, normals, centroids, areas, bounds };
}

/**
 * Points spread over triangle `t` no more than SAMPLE_SPACING_M apart, so big
 * triangles on flat walls are covered as densely as small ones on bumpy
 * patches. Small triangles give just their centre.
 */
function sampleTriangle(soup: TriangleSoup, t: number, out: number[]) {
  const v = soup.verts;
  const o = t * 9;
  const longest = Math.max(
    Math.hypot(v[o + 3] - v[o], v[o + 4] - v[o + 1], v[o + 5] - v[o + 2]),
    Math.hypot(v[o + 6] - v[o + 3], v[o + 7] - v[o + 4], v[o + 8] - v[o + 5]),
    Math.hypot(v[o] - v[o + 6], v[o + 1] - v[o + 7], v[o + 2] - v[o + 8]),
  );
  const k = Math.min(60, Math.ceil(longest / SAMPLE_SPACING_M));
  if (k <= 1) {
    out.push(
      soup.centroids[t * 3],
      soup.centroids[t * 3 + 1],
      soup.centroids[t * 3 + 2],
    );
    return;
  }
  for (let a = 0; a < k; a++) {
    for (let b = 0; a + b < k; b++) {
      const wa = (a + 1 / 3) / k;
      const wb = (b + 1 / 3) / k;
      const wc = 1 - wa - wb;
      out.push(
        v[o] * wc + v[o + 3] * wa + v[o + 6] * wb,
        v[o + 1] * wc + v[o + 4] * wa + v[o + 7] * wb,
        v[o + 2] * wc + v[o + 5] * wa + v[o + 8] * wb,
      );
    }
  }
}

/* Planes ------------------------------------------------------------------- */

interface Plane {
  n: THREE.Vector3;
  /** Plane is n · p = d. */
  d: number;
  /** Triangles on it, possibly in several separate places. */
  tris: number[];
}

/*
 * Facing-direction histogram: 10° cells by compass heading and tilt, plus one
 * cell each for straight up and straight down, so floors and ceilings (whose
 * scanned normals scatter every which way around vertical) land together.
 */
const HEADING_BINS = 36;
const TILT_BINS = 16;
const POLE_COS = Math.cos((10 * Math.PI) / 180);
const POLE_UP = HEADING_BINS * TILT_BINS;
const POLE_DOWN = POLE_UP + 1;
const MAX_TILT = Math.asin(POLE_COS);

function directionBin(x: number, y: number, z: number): number {
  if (y > POLE_COS) return POLE_UP;
  if (y < -POLE_COS) return POLE_DOWN;
  let heading = Math.atan2(z, x);
  if (heading < 0) heading += Math.PI * 2;
  const h = Math.min(
    HEADING_BINS - 1,
    Math.floor((heading / (Math.PI * 2)) * HEADING_BINS),
  );
  const tilt = Math.min(
    TILT_BINS - 1,
    Math.max(
      0,
      Math.floor(((Math.asin(y) + MAX_TILT) / (2 * MAX_TILT)) * TILT_BINS),
    ),
  );
  return tilt * HEADING_BINS + h;
}

/** Whether bin `b` is `centre` or one of its neighbours (heading wraps). */
function binNear(b: number, centre: number): boolean {
  if (centre >= POLE_UP || b >= POLE_UP) return b === centre;
  const dh = Math.abs((b % HEADING_BINS) - (centre % HEADING_BINS));
  const dt = Math.abs(
    Math.floor(b / HEADING_BINS) - Math.floor(centre / HEADING_BINS),
  );
  return Math.min(dh, HEADING_BINS - dh) <= 1 && dt <= 1;
}

/**
 * Greedily pulls planes out of the triangles, biggest first: find the most
 * common facing direction, then the most common offset along it, fit a plane
 * to the triangles there, take them out, repeat. Deterministic, and robust to
 * the holes and bumps that throw off region growing over a scan's mesh.
 */
function detectPlanes(soup: TriangleSoup): Plane[] {
  const { count, normals, centroids, areas } = soup;
  const bins = new Int32Array(count);
  for (let t = 0; t < count; t++) {
    bins[t] = directionBin(
      normals[t * 3],
      normals[t * 3 + 1],
      normals[t * 3 + 2],
    );
  }
  const offsetOf = (t: number, n: THREE.Vector3) =>
    centroids[t * 3] * n.x +
    centroids[t * 3 + 1] * n.y +
    centroids[t * 3 + 2] * n.z;
  const facingOf = (t: number, n: THREE.Vector3) =>
    normals[t * 3] * n.x + normals[t * 3 + 1] * n.y + normals[t * 3 + 2] * n.z;

  let active = new Int32Array(count);
  for (let t = 0; t < count; t++) active[t] = t;
  let activeCount = count;
  const taken = new Uint8Array(count);
  const binArea = new Float64Array(POLE_DOWN + 1);
  const planes: Plane[] = [];
  const n = new THREE.Vector3();
  const sum = new THREE.Vector3();

  for (let iter = 0; iter < 200 && activeCount > 0; iter++) {
    binArea.fill(0);
    for (let i = 0; i < activeCount; i++) {
      binArea[bins[active[i]]] += areas[active[i]];
    }
    let best = -1;
    let bestScore = 0;
    for (let b = 0; b <= POLE_DOWN; b++) {
      let score = 0;
      if (b >= POLE_UP) {
        score = binArea[b];
      } else {
        const h = b % HEADING_BINS;
        const tilt = Math.floor(b / HEADING_BINS);
        for (let dt = -1; dt <= 1; dt++) {
          const tt = tilt + dt;
          if (tt < 0 || tt >= TILT_BINS) continue;
          for (let dh = -1; dh <= 1; dh++) {
            const hh = (h + dh + HEADING_BINS) % HEADING_BINS;
            score += binArea[tt * HEADING_BINS + hh];
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best < 0 || bestScore < MIN_PATCH_AREA_M2) break;

    // Seed direction: area-weighted mean normal around the peak.
    const peak = best;
    const inPeak = (b: number) => binNear(b, peak);
    n.set(0, 0, 0);
    for (let i = 0; i < activeCount; i++) {
      const t = active[i];
      if (!inPeak(bins[t])) continue;
      n.x += normals[t * 3] * areas[t];
      n.y += normals[t * 3 + 1] * areas[t];
      n.z += normals[t * 3 + 2] * areas[t];
    }
    n.normalize();

    // Most common offset along it.
    let dMin = Infinity;
    let dMax = -Infinity;
    const candidates: number[] = [];
    for (let i = 0; i < activeCount; i++) {
      const t = active[i];
      if (facingOf(t, n) < PLANE_ANGLE_COS) continue;
      candidates.push(t);
      const d = offsetOf(t, n);
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }

    let inliers: number[] = [];
    if (candidates.length > 0) {
      const binSize = PLANE_TOLERANCE_M * 0.67;
      const offsetBins = Math.max(1, Math.ceil((dMax - dMin) / binSize) + 1);
      const hist = new Float64Array(offsetBins);
      for (const t of candidates) {
        hist[Math.floor((offsetOf(t, n) - dMin) / binSize)] += areas[t];
      }
      let peak = 0;
      let peakScore = -1;
      for (let b = 0; b < offsetBins; b++) {
        const score =
          hist[b] * 2 +
          (b > 0 ? hist[b - 1] : 0) +
          (b + 1 < offsetBins ? hist[b + 1] : 0);
        if (score > peakScore) {
          peakScore = score;
          peak = b;
        }
      }
      let d = dMin + (peak + 0.5) * binSize;

      // Fit, then refit once on the tighter set.
      for (let pass = 0; pass < 2; pass++) {
        inliers = [];
        sum.set(0, 0, 0);
        let wSum = 0;
        for (const t of candidates) {
          if (facingOf(t, n) < PLANE_ANGLE_COS) continue;
          if (Math.abs(offsetOf(t, n) - d) > PLANE_TOLERANCE_M) continue;
          inliers.push(t);
          sum.x += normals[t * 3] * areas[t];
          sum.y += normals[t * 3 + 1] * areas[t];
          sum.z += normals[t * 3 + 2] * areas[t];
          wSum += areas[t];
        }
        if (wSum === 0) break;
        n.copy(sum).normalize();
        snapNormal(n);
        let dSum = 0;
        for (const t of inliers) dSum += offsetOf(t, n) * areas[t];
        d = dSum / wSum;
      }

      let inlierArea = 0;
      for (const t of inliers) inlierArea += areas[t];
      if (inlierArea >= MIN_PATCH_AREA_M2) {
        planes.push({ n: n.clone(), d, tris: inliers });
      } else {
        inliers = [];
      }
    }

    if (inliers.length > 0) {
      for (const t of inliers) taken[t] = 1;
    } else {
      // Nothing worth keeping faces this way any more: retire the direction.
      for (let i = 0; i < activeCount; i++) {
        if (inPeak(bins[active[i]])) taken[active[i]] = 1;
      }
    }

    let w = 0;
    const next = new Int32Array(activeCount);
    for (let i = 0; i < activeCount; i++) {
      if (!taken[active[i]]) next[w++] = active[i];
    }
    active = next;
    activeCount = w;
  }

  return planes;
}

/** Makes near-vertical walls vertical and near-level floors level. */
function snapNormal(n: THREE.Vector3) {
  if (Math.abs(n.y) < SNAP_SIN) {
    n.y = 0;
    n.normalize();
  } else if (Math.abs(n.y) > Math.sqrt(1 - SNAP_SIN * SNAP_SIN)) {
    n.set(0, Math.sign(n.y), 0);
  }
}

/* Patches ------------------------------------------------------------------ */

interface Patch {
  id: number;
  n: THREE.Vector3;
  d: number;
  area: number;
  /** Points spread over the patch, xyz. */
  samples: Float32Array;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /**
   * In-plane axes, and the patch's outline in them as u v pairs: the smallest
   * rectangle around it, since walls and floors are rectangles with corners
   * and edges often missing where something stood in front of them.
   */
  e1: THREE.Vector3;
  e2: THREE.Vector3;
  hull: number[];
}

/**
 * Splits each plane into its separate pieces: one plane can hold both a wall
 * and, across the room, a cabinet face that happens to line up with it.
 */
function splitIntoPatches(soup: TriangleSoup, planes: Plane[]): Patch[] {
  const patches: Patch[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();

  for (const plane of planes) {
    if (Math.abs(plane.n.y) < 0.9) e1.set(0, 1, 0).cross(plane.n).normalize();
    else e1.set(1, 0, 0).cross(plane.n).normalize();
    e2.copy(plane.n).cross(e1);

    const pts: number[] = [];
    const triFirstSample: number[] = [];
    for (const t of plane.tris) {
      triFirstSample.push(pts.length / 3);
      sampleTriangle(soup, t, pts);
    }
    const sampleCount = pts.length / 3;
    const us = new Float32Array(sampleCount);
    const vs = new Float32Array(sampleCount);
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const x = pts[i * 3];
      const y = pts[i * 3 + 1];
      const z = pts[i * 3 + 2];
      us[i] = x * e1.x + y * e1.y + z * e1.z;
      vs[i] = x * e2.x + y * e2.y + z * e2.z;
      if (us[i] < uMin) uMin = us[i];
      if (us[i] > uMax) uMax = us[i];
      if (vs[i] < vMin) vMin = vs[i];
      if (vs[i] > vMax) vMax = vs[i];
    }
    const cols = Math.ceil((uMax - uMin) / PATCH_CELL_M) + 3;
    const rows = Math.ceil((vMax - vMin) / PATCH_CELL_M) + 3;
    const cellOf = (i: number) =>
      (Math.floor((vs[i] - vMin) / PATCH_CELL_M) + 1) * cols +
      Math.floor((us[i] - uMin) / PATCH_CELL_M) +
      1;

    let grid: Uint8Array = new Uint8Array(cols * rows);
    for (let i = 0; i < sampleCount; i++) grid[cellOf(i)] = 1;
    // Bridges scan gaps of a cell or two within one surface.
    grid = dilate(grid, cols, rows, 1);
    const { labels, count } = labelComponents(grid, cols, rows);

    const groups = Array.from({ length: count }, () => ({
      pts: [] as number[],
      area: 0,
      // In-plane moments, for the patch's width.
      su: 0,
      sv: 0,
      suu: 0,
      svv: 0,
      suv: 0,
      uv: [] as number[],
    }));
    for (let i = 0; i < sampleCount; i++) {
      const g = groups[labels[cellOf(i)] - 1];
      g.pts.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      g.su += us[i];
      g.sv += vs[i];
      g.suu += us[i] * us[i];
      g.svv += vs[i] * vs[i];
      g.suv += us[i] * vs[i];
      g.uv.push(us[i], vs[i]);
    }
    plane.tris.forEach((t, k) => {
      groups[labels[cellOf(triFirstSample[k])] - 1].area += soup.areas[t];
    });

    for (const g of groups) {
      if (g.area < MIN_PATCH_AREA_M2) continue;
      if (patchWidth(g) < MIN_PATCH_WIDTH_M) continue;
      const samples = new Float32Array(g.pts);
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < samples.length; i += 3) {
        min.x = Math.min(min.x, samples[i]);
        min.y = Math.min(min.y, samples[i + 1]);
        min.z = Math.min(min.z, samples[i + 2]);
        max.x = Math.max(max.x, samples[i]);
        max.y = Math.max(max.y, samples[i + 1]);
        max.z = Math.max(max.z, samples[i + 2]);
      }
      patches.push({
        id: patches.length,
        n: plane.n.clone(),
        d: plane.d,
        area: g.area,
        samples,
        min,
        max,
        e1: e1.clone(),
        e2: e2.clone(),
        hull: smallestRectangle(convexHull(g.uv)),
      });
    }
  }
  return patches;
}

/** Convex hull of 2D points (x y pairs), counter-clockwise, as x y pairs. */
function convexHull(xy: number[]): number[] {
  const n = xy.length / 2;
  if (n < 3) return [];
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => xy[i * 2] - xy[j * 2] || xy[i * 2 + 1] - xy[j * 2 + 1],
  );
  const cross = (o: number, a: number, b: number) =>
    (xy[a * 2] - xy[o * 2]) * (xy[b * 2 + 1] - xy[o * 2 + 1]) -
    (xy[a * 2 + 1] - xy[o * 2 + 1]) * (xy[b * 2] - xy[o * 2]);
  const lower: number[] = [];
  for (const i of idx) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0
    ) {
      lower.pop();
    }
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0
    ) {
      upper.pop();
    }
    upper.push(i);
  }
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return ring.flatMap((i) => [xy[i * 2], xy[i * 2 + 1]]);
}

/**
 * Smallest-area rectangle around a convex hull (one of its sides lies along a
 * hull edge), as four counter-clockwise corners.
 */
function smallestRectangle(hull: number[]): number[] {
  const k = hull.length / 2;
  if (k < 3) return hull;
  let best: number[] = hull;
  let bestArea = Infinity;
  for (let i = 0; i < k; i++) {
    const ax = hull[i * 2];
    const ay = hull[i * 2 + 1];
    let ex = hull[((i + 1) % k) * 2] - ax;
    let ey = hull[((i + 1) % k) * 2 + 1] - ay;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    ex /= len;
    ey /= len;
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (let j = 0; j < k; j++) {
      const dx = hull[j * 2] - ax;
      const dy = hull[j * 2 + 1] - ay;
      const a = dx * ex + dy * ey;
      const b = -dx * ey + dy * ex;
      minA = Math.min(minA, a);
      maxA = Math.max(maxA, a);
      minB = Math.min(minB, b);
      maxB = Math.max(maxB, b);
    }
    const area = (maxA - minA) * (maxB - minB);
    if (area < bestArea) {
      bestArea = area;
      const at = (a: number, b: number) => [
        ax + a * ex - b * ey,
        ay + a * ey + b * ex,
      ];
      best = [
        ...at(minA, minB),
        ...at(maxA, minB),
        ...at(maxA, maxB),
        ...at(minA, maxB),
      ];
    }
  }
  return best;
}

/**
 * Whether (u, v) lies inside a counter-clockwise convex `hull` by at least
 * `inset`.
 */
function insideHull(hull: number[], u: number, v: number, inset: number) {
  const k = hull.length / 2;
  if (k < 3) return false;
  for (let i = 0; i < k; i++) {
    const ax = hull[i * 2];
    const ay = hull[i * 2 + 1];
    const bx = hull[((i + 1) % k) * 2];
    const by = hull[((i + 1) % k) * 2 + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey) || 1;
    // Distance left of the edge; inside is left for a counter-clockwise ring.
    if ((ex * (v - ay) - ey * (u - ax)) / len < inset) return false;
  }
  return true;
}

/**
 * Width of a patch across its narrow direction, from the spread of its points:
 * a uniformly covered strip w wide has variance w² / 12 across it.
 */
function patchWidth(g: {
  pts: number[];
  su: number;
  sv: number;
  suu: number;
  svv: number;
  suv: number;
}): number {
  const k = g.pts.length / 3;
  if (k < 3) return 0;
  const mu = g.su / k;
  const mv = g.sv / k;
  const cuu = g.suu / k - mu * mu;
  const cvv = g.svv / k - mv * mv;
  const cuv = g.suv / k - mu * mv;
  const half = (cuu + cvv) / 2;
  const spread = Math.sqrt(Math.max(0, half * half - (cuu * cvv - cuv * cuv)));
  const narrowVariance = Math.max(0, half - spread);
  return Math.sqrt(12 * narrowVariance);
}

/* Room shell --------------------------------------------------------------- */

/**
 * Sparse voxel grid of which way the surfaces in each cell face, and of which
 * cells hold any scanned geometry at all (furniture included).
 */
interface FacingGrid {
  /** Cell index for a point, or -1 outside the grid. */
  cellOf: (x: number, y: number, z: number) => number;
  slots: Map<number, number>;
  /** Summed facing per surface-holding cell, xyz per slot. */
  facing: number[];
  occupied: Set<number>;
  reach: number;
}

function buildFacingGrid(patches: Patch[], soup: TriangleSoup): FacingGrid {
  const bounds = soup.bounds;
  const cell = VOXEL_M;
  const ox = bounds.min.x - cell;
  const oy = bounds.min.y - cell;
  const oz = bounds.min.z - cell;
  const nx = Math.ceil((bounds.max.x - ox) / cell) + 2;
  const ny = Math.ceil((bounds.max.y - oy) / cell) + 2;
  const nz = Math.ceil((bounds.max.z - oz) / cell) + 2;
  const cellOf = (x: number, y: number, z: number) => {
    const ix = Math.floor((x - ox) / cell);
    const iy = Math.floor((y - oy) / cell);
    const iz = Math.floor((z - oz) / cell);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) {
      return -1;
    }
    return ix + nx * (iy + ny * iz);
  };

  const slots = new Map<number, number>();
  const facing: number[] = [];
  for (const p of patches) {
    const s = p.samples;
    for (let i = 0; i < s.length; i += 3) {
      const k = cellOf(s[i], s[i + 1], s[i + 2]);
      if (k < 0) continue;
      let slot = slots.get(k);
      if (slot === undefined) {
        slot = facing.length / 3;
        slots.set(k, slot);
        facing.push(0, 0, 0);
      }
      facing[slot * 3] += p.n.x;
      facing[slot * 3 + 1] += p.n.y;
      facing[slot * 3 + 2] += p.n.z;
    }
  }
  const occupied = new Set<number>();
  const pts: number[] = [];
  for (let t = 0; t < soup.count; t++) {
    pts.length = 0;
    sampleTriangle(soup, t, pts);
    for (let i = 0; i < pts.length; i += 3) {
      const k = cellOf(pts[i], pts[i + 1], pts[i + 2]);
      if (k >= 0) occupied.add(k);
    }
  }

  return {
    cellOf,
    slots,
    facing,
    occupied,
    reach: bounds.getSize(new THREE.Vector3()).length(),
  };
}

/**
 * Whether a surface is part of the room itself rather than something in it.
 * Scans only capture what faces the room, so a wall, floor, ceiling or the
 * inside of a recess has nothing behind it facing back toward it, while a
 * counter top has the floor under it and a sink front or stall partition has
 * a wall behind it. Looks straight behind a spread of points on the surface.
 *
 * The scanner never sees behind a bin or under a block standing against a
 * wall, so the wall or floor there is missing. Behind counts as blocked, too,
 * when it crosses the plane of a big surface facing back, inside that
 * surface's outline with its gaps filled.
 */
function boundsRoom(patch: Patch, all: Patch[], grid: FacingGrid): boolean {
  const enclosing = all.filter(
    (q) => q !== patch && q.area >= ENCLOSING_AREA_M2 && q.n.dot(patch.n) > 0.5,
  );
  const behindEnclosing = (x: number, y: number, z: number): boolean => {
    for (const q of enclosing) {
      // The ray x - n·t meets q's plane at t; q faces back toward it.
      const t = (q.n.x * x + q.n.y * y + q.n.z * z - q.d) / q.n.dot(patch.n);
      if (t < VOXEL_M || t > grid.reach) continue;
      const hx = x - patch.n.x * t;
      const hy = y - patch.n.y * t;
      const hz = z - patch.n.z * t;
      const u = hx * q.e1.x + hy * q.e1.y + hz * q.e1.z;
      const v = hx * q.e2.x + hy * q.e2.y + hz * q.e2.z;
      if (insideHull(q.hull, u, v, VOXEL_M)) return true;
    }
    return false;
  };

  const { cellOf, slots, facing } = grid;
  const n = patch.n;
  const step = VOXEL_M * 0.5;
  const stepCount = Math.ceil(grid.reach / step);
  const s = patch.samples;
  const total = s.length / 3;
  const tries = Math.min(16, total);
  let blocked = 0;

  for (let k = 0; k < tries; k++) {
    const i = Math.floor(((k + 0.5) / tries) * total) * 3;
    if (behindEnclosing(s[i], s[i + 1], s[i + 2])) {
      blocked++;
      continue;
    }
    // Start past the surface's own bumps and cells.
    let x = s[i] - n.x * VOXEL_M * 2;
    let y = s[i + 1] - n.y * VOXEL_M * 2;
    let z = s[i + 2] - n.z * VOXEL_M * 2;
    for (let j = 0; j < stepCount; j++) {
      const cell = cellOf(x, y, z);
      if (cell < 0) break;
      const slot = slots.get(cell);
      if (slot !== undefined) {
        const fx = facing[slot * 3];
        const fy = facing[slot * 3 + 1];
        const fz = facing[slot * 3 + 2];
        // A surface behind this one, facing back toward it.
        if (fx * n.x + fy * n.y + fz * n.z > 0.5 * Math.hypot(fx, fy, fz)) {
          blocked++;
          break;
        }
      }
      x -= n.x * step;
      y -= n.y * step;
      z -= n.z * step;
    }
  }
  return blocked < tries * 0.5;
}

/**
 * Folds each room surface into a bigger parallel one facing the same way less
 * than MERGE_OFFSET_M from it and beside it, flattening its points onto that
 * plane, so a slightly recessed door or a bulge reads as part of its wall.
 */
function mergeOffsetSurfaces(shell: Patch[]): Patch[] {
  const sorted = [...shell].sort((a, b) => b.area - a.area);
  const kept: Patch[] = [];
  const parallelCos = Math.cos((6 * Math.PI) / 180);
  const reach = MERGE_OFFSET_M + 0.05;

  for (const p of sorted) {
    const host = kept.find(
      (q) =>
        q.n.dot(p.n) > parallelCos &&
        Math.abs(planeOffsetAt(q, p) - q.d) < MERGE_OFFSET_M &&
        p.min.x <= q.max.x + reach &&
        q.min.x <= p.max.x + reach &&
        p.min.y <= q.max.y + reach &&
        q.min.y <= p.max.y + reach &&
        p.min.z <= q.max.z + reach &&
        q.min.z <= p.max.z + reach,
    );
    if (!host) {
      kept.push({ ...p, min: p.min.clone(), max: p.max.clone() });
      continue;
    }
    const s = p.samples;
    const flat = new Float32Array(host.samples.length + s.length);
    flat.set(host.samples);
    for (let i = 0; i < s.length; i += 3) {
      const off =
        host.n.x * s[i] + host.n.y * s[i + 1] + host.n.z * s[i + 2] - host.d;
      const o = host.samples.length + i;
      flat[o] = s[i] - host.n.x * off;
      flat[o + 1] = s[i + 1] - host.n.y * off;
      flat[o + 2] = s[i + 2] - host.n.z * off;
      host.min.min(new THREE.Vector3(flat[o], flat[o + 1], flat[o + 2]));
      host.max.max(new THREE.Vector3(flat[o], flat[o + 1], flat[o + 2]));
    }
    host.samples = flat;
    host.area += p.area;
  }
  return kept;
}

/** Where `p`'s surface sits along `q`'s normal: its mean offset. */
function planeOffsetAt(q: Patch, p: Patch): number {
  const s = p.samples;
  let sum = 0;
  for (let i = 0; i < s.length; i += 3) {
    sum += q.n.x * s[i] + q.n.y * s[i + 1] + q.n.z * s[i + 2];
  }
  return sum / (s.length / 3);
}

/* Edges -------------------------------------------------------------------- */

interface Edge {
  a: Patch;
  b: Patch;
  /** Line: point + t * dir. */
  point: THREE.Vector3;
  dir: THREE.Vector3;
  t0: number;
  t1: number;
  /** True at an inside corner (a room corner), false at an outside one. */
  concave: boolean;
}

/**
 * Whether something standing in the room hides most of the stretch [from, to]
 * of an edge's line: looking from points along it out into the room (between
 * the two surfaces, which face the room), scanned geometry is close by. That
 * is why a scan has no wall or floor there, so the edge carries on through.
 * An open doorway has nothing in front of it and stays a gap.
 */
function hiddenFromRoom(
  e: Pick<Edge, "a" | "b" | "point" | "dir">,
  from: number,
  to: number,
  grid: FacingGrid,
): boolean {
  const look = new THREE.Vector3().addVectors(e.a.n, e.b.n);
  if (look.lengthSq() < 1e-6) return false;
  look.normalize();
  const span = to - from;
  if (span <= 0) return true;
  const count = Math.max(1, Math.ceil(span / (VOXEL_M * 1.5)));
  const step = VOXEL_M * 0.5;
  let hidden = 0;
  for (let k = 0; k < count; k++) {
    const t = from + ((k + 0.5) / count) * span;
    const bx = e.point.x + e.dir.x * t;
    const by = e.point.y + e.dir.y * t;
    const bz = e.point.z + e.dir.z * t;
    for (let r = BRIDGE_LOOK_FROM_M; r <= BRIDGE_LOOK_TO_M; r += step) {
      const cell = grid.cellOf(
        bx + look.x * r,
        by + look.y * r,
        bz + look.z * r,
      );
      if (grid.occupied.has(cell)) {
        hidden++;
        break;
      }
    }
  }
  return hidden >= count * BRIDGE_HIDDEN_SHARE;
}

/**
 * For every two surfaces at an angle, the line their planes cross on, and the
 * stretches of it that both surfaces actually reach, joined across gaps that
 * something in the room hid from the scanner.
 */
function findEdges(shell: Patch[], grid: FacingGrid): Edge[] {
  const edges: Edge[] = [];
  const near2 = EDGE_NEAR_M * EDGE_NEAR_M;
  const m = EDGE_NEAR_M;

  for (let i = 0; i < shell.length; i++) {
    for (let j = i + 1; j < shell.length; j++) {
      const a = shell[i];
      const b = shell[j];
      const c = a.n.dot(b.n);
      if (Math.abs(c) > EDGE_MIN_ANGLE_COS) continue;
      if (
        a.max.x + m < b.min.x ||
        b.max.x + m < a.min.x ||
        a.max.y + m < b.min.y ||
        b.max.y + m < a.min.y ||
        a.max.z + m < b.min.z ||
        b.max.z + m < a.min.z
      ) {
        continue;
      }

      const dir = new THREE.Vector3().crossVectors(a.n, b.n).normalize();
      const det = 1 - c * c;
      const point = new THREE.Vector3()
        .copy(a.n)
        .multiplyScalar((a.d - b.d * c) / det)
        .addScaledVector(b.n, (b.d - a.d * c) / det);

      // Positions along the line of each surface's points near it, and the
      // side of the line each surface lies on.
      const collect = (p: Patch, out: number[], side: THREE.Vector3) => {
        const s = p.samples;
        for (let k = 0; k < s.length; k += 3) {
          const wx = s[k] - point.x;
          const wy = s[k + 1] - point.y;
          const wz = s[k + 2] - point.z;
          const t = wx * dir.x + wy * dir.y + wz * dir.z;
          if (wx * wx + wy * wy + wz * wz - t * t > near2) continue;
          out.push(t);
          side.x += wx - t * dir.x;
          side.y += wy - t * dir.y;
          side.z += wz - t * dir.z;
        }
      };
      const nearA: number[] = [];
      const nearB: number[] = [];
      const sideA = new THREE.Vector3();
      const sideB = new THREE.Vector3();
      collect(a, nearA, sideA);
      if (nearA.length < 2) continue;
      collect(b, nearB, sideB);
      if (nearB.length < 2) continue;

      let tMin = Infinity;
      let tMax = -Infinity;
      for (const t of nearA) {
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
      }
      const binCount = Math.ceil((tMax - tMin) / EDGE_BIN_M) + 1;
      if (binCount > 4000) continue;
      const countA = new Uint16Array(binCount);
      const countB = new Uint16Array(binCount);
      for (const t of nearA) countA[Math.floor((t - tMin) / EDGE_BIN_M)]++;
      for (const t of nearB) {
        const bin = Math.floor((t - tMin) / EDGE_BIN_M);
        if (bin >= 0 && bin < binCount) countB[bin]++;
      }

      // At an inside corner each surface lies in front of the other's plane.
      const concave = sideB.dot(a.n) > 0;

      // How far a surface extends from the line along this stretch of it.
      const reachOf = (p: Patch, t0: number, t1: number) => {
        let farthest2 = 0;
        const s = p.samples;
        for (let k = 0; k < s.length; k += 3) {
          const wx = s[k] - point.x;
          const wy = s[k + 1] - point.y;
          const wz = s[k + 2] - point.z;
          const t = wx * dir.x + wy * dir.y + wz * dir.z;
          if (t < t0 || t > t1) continue;
          const off2 = wx * wx + wy * wy + wz * wz - t * t;
          if (off2 > farthest2) farthest2 = off2;
        }
        return Math.sqrt(farthest2);
      };
      // Stretches both surfaces reach, small scan holes already bridged.
      const runs: [number, number][] = [];
      let runStart = -1;
      let lastHit = -1;
      for (let k = 0; k < binCount; k++) {
        if (countA[k] >= 2 && countB[k] >= 2) {
          if (runStart < 0) runStart = k;
          lastHit = k;
        } else if (runStart >= 0 && k - lastHit > EDGE_GAP_BINS) {
          runs.push([runStart, lastHit]);
          runStart = -1;
        }
      }
      if (runStart >= 0) runs.push([runStart, lastHit]);

      // Bigger gaps carry on where something in the room hid them.
      const line = { a, b, point, dir };
      const joined: [number, number][] = [];
      for (const [k0, k1] of runs) {
        const t0 = tMin + k0 * EDGE_BIN_M;
        const t1 = tMin + (k1 + 1) * EDGE_BIN_M;
        const prev = joined[joined.length - 1];
        if (
          prev &&
          t0 - prev[1] <= BRIDGE_MAX_M &&
          hiddenFromRoom(line, prev[1], t0, grid)
        ) {
          prev[1] = t1;
        } else {
          joined.push([t0, t1]);
        }
      }

      for (const [t0, t1] of joined) {
        if (t1 - t0 < MIN_EDGE_M) continue;
        if (reachOf(a, t0, t1) < EDGE_REACH_M) continue;
        if (reachOf(b, t0, t1) < EDGE_REACH_M) continue;
        edges.push({ a, b, point, dir, t0, t1, concave });
      }
    }
  }
  return edges;
}

/**
 * Moves each edge end onto the corner where its two surfaces meet a third, so
 * edges meet crisply and measure corner to corner instead of to wherever the
 * scanned (rounded) surfaces happened to stop. An end that stops short of its
 * corner because something stands in front of it (a bin in the corner) is
 * carried on to the corner.
 */
function snapCorners(edges: Edge[], grid: FacingGrid) {
  const neighbours = new Map<Patch, Set<Patch>>();
  const link = (p: Patch, q: Patch) => {
    let set = neighbours.get(p);
    if (!set) neighbours.set(p, (set = new Set()));
    set.add(q);
  };
  for (const e of edges) {
    link(e.a, e.b);
    link(e.b, e.a);
  }
  const corner = new THREE.Vector3();

  for (const e of edges) {
    const thirds = new Set<Patch>([
      ...(neighbours.get(e.a) ?? []),
      ...(neighbours.get(e.b) ?? []),
    ]);
    thirds.delete(e.a);
    thirds.delete(e.b);
    const corners: number[] = [];
    for (const p of thirds) {
      if (planeCorner(e.a, e.b, p, corner)) {
        corners.push(corner.sub(e.point).dot(e.dir));
      }
    }
    // `away` is -1 for the start, 1 for the end: the way the edge would grow.
    const snapEnd = (end: number, away: number): number => {
      let best = end;
      let bestGap = CORNER_SNAP_M;
      for (const t of corners) {
        if (Math.abs(t - end) < bestGap) {
          bestGap = Math.abs(t - end);
          best = t;
        }
      }
      if (best !== end) return best;
      let next: number | null = null;
      for (const t of corners) {
        const ahead = (t - end) * away;
        if (ahead <= 0 || ahead > BRIDGE_MAX_M) continue;
        if (next === null || ahead < (next - end) * away) next = t;
      }
      if (
        next !== null &&
        hiddenFromRoom(e, Math.min(end, next), Math.max(end, next), grid)
      ) {
        return next;
      }
      return end;
    };
    const snap0 = snapEnd(e.t0, -1);
    const snap1 = snapEnd(e.t1, 1);
    if (snap1 > snap0) {
      e.t0 = snap0;
      e.t1 = snap1;
    }
  }
}

/** Where three planes meet, if they do so at a usable angle. */
function planeCorner(
  a: Patch,
  b: Patch,
  c: Patch,
  out: THREE.Vector3,
): boolean {
  const bc = new THREE.Vector3().crossVectors(b.n, c.n);
  const det = a.n.dot(bc);
  if (Math.abs(det) < 0.2) return false;
  const ca = new THREE.Vector3().crossVectors(c.n, a.n);
  const ab = new THREE.Vector3().crossVectors(a.n, b.n);
  out
    .copy(bc)
    .multiplyScalar(a.d)
    .addScaledVector(ca, b.d)
    .addScaledVector(ab, c.d)
    .divideScalar(det);
  return true;
}

function toSegment(e: Edge, i: number): MeasureSegment {
  const start = e.point.clone().addScaledVector(e.dir, e.t0);
  const end = e.point.clone().addScaledVector(e.dir, e.t1);
  const lengthM = e.t1 - e.t0;
  // Surfaces face into the room, so their normals' sum points into the open
  // at a corner: flip it out of the room at an inside corner, keep it at an
  // outside one.
  const outward = e.a.n.clone().add(e.b.n);
  if (outward.lengthSq() < 1e-6) outward.copy(e.a.n);
  outward.normalize();
  if (e.concave) outward.negate();
  return {
    id: `edge-${i}`,
    kind: Math.abs(e.dir.y) > 0.94 ? "vertical" : "horizontal",
    start,
    end,
    lengthM,
    label: formatMetres(lengthM),
    outward,
  };
}

function dedupeCorners(edges: Edge[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const p = new THREE.Vector3();
  for (const e of edges) {
    for (const t of [e.t0, e.t1]) {
      p.copy(e.point).addScaledVector(e.dir, t);
      if (!out.some((q) => q.distanceToSquared(p) < 0.03 * 0.03)) {
        out.push(p.clone());
      }
    }
  }
  return out;
}

/* Floor area --------------------------------------------------------------- */

/**
 * Area of the main floor, with what stands on it (toilets, bins) filled in:
 * the floor surface plus the foot of every wall, rasterised from above, gaps
 * closed and enclosed holes filled. Recesses higher up don't count.
 */
function floorArea(shell: Patch[]): number {
  let floor: Patch | null = null;
  for (const p of shell) {
    if (p.n.y > 0.9 && (!floor || p.area > floor.area)) floor = p;
  }
  if (!floor) return 0;
  const floorY = floor.d / floor.n.y;

  const pts: number[] = [];
  const add = (s: Float32Array, keepY?: (y: number) => boolean) => {
    for (let i = 0; i < s.length; i += 3) {
      if (!keepY || keepY(s[i + 1])) pts.push(s[i], s[i + 2]);
    }
  };
  add(floor.samples);
  for (const p of shell) {
    if (Math.abs(p.n.y) < 0.2) {
      add(p.samples, (y) => y > floorY - 0.1 && y < floorY + 0.5);
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minZ = Math.min(minZ, pts[i + 1]);
    maxZ = Math.max(maxZ, pts[i + 1]);
  }
  const cell = PATCH_CELL_M;
  const pad = 4;
  const cols = Math.ceil((maxX - minX) / cell) + 1 + pad * 2;
  const rows = Math.ceil((maxZ - minZ) / cell) + 1 + pad * 2;
  let grid: Uint8Array = new Uint8Array(cols * rows);
  for (let i = 0; i < pts.length; i += 2) {
    const c = Math.floor((pts[i] - minX) / cell) + pad;
    const r = Math.floor((pts[i + 1] - minZ) / cell) + pad;
    grid[r * cols + c] = 1;
  }
  grid = erode(dilate(grid, cols, rows, 2), cols, rows, 2);
  grid = fillInteriorHoles(grid, cols, rows);
  grid = keepLargestComponent(grid, cols, rows);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  return filled * cell * cell;
}

/* Fallback ----------------------------------------------------------------- */

function boxMeasurement(box: THREE.Box3): RoomMeasurement {
  const { min, max } = box;
  const centre = box.getCenter(new THREE.Vector3());
  const corner = (i: number) =>
    new THREE.Vector3(
      i & 1 ? max.x : min.x,
      i & 2 ? max.y : min.y,
      i & 4 ? max.z : min.z,
    );
  const segments: MeasureSegment[] = [];
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      if (i & bit) continue;
      const start = corner(i);
      const end = corner(i | bit);
      const lengthM = start.distanceTo(end);
      segments.push({
        id: `box-${i}-${bit}`,
        kind: bit === 2 ? "vertical" : "horizontal",
        start,
        end,
        lengthM,
        label: formatMetres(lengthM),
        outward: start
          .clone()
          .add(end)
          .multiplyScalar(0.5)
          .sub(centre)
          .normalize(),
      });
    }
  }
  const areaM2 = (max.x - min.x) * (max.z - min.z);
  return {
    corners: Array.from({ length: 8 }, (_, i) => corner(i)),
    areaM2,
    areaSqFt: areaM2 * SQM_TO_SQFT,
    segments,
  };
}

/* Grid helpers ------------------------------------------------------------- */

function dilate(
  src: Uint8Array,
  cols: number,
  rows: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(cols * rows);
  const r2 = radius * radius + 0.25;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!src[r * cols + c]) continue;
      const rMin = Math.max(0, r - radius);
      const rMax = Math.min(rows - 1, r + radius);
      const cMin = Math.max(0, c - radius);
      const cMax = Math.min(cols - 1, c + radius);
      for (let nr = rMin; nr <= rMax; nr++) {
        const dr = nr - r;
        for (let nc = cMin; nc <= cMax; nc++) {
          const dc = nc - c;
          if (dr * dr + dc * dc <= r2) out[nr * cols + nc] = 1;
        }
      }
    }
  }
  return out;
}

function erode(
  src: Uint8Array,
  cols: number,
  rows: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(cols * rows);
  const r2 = radius * radius + 0.25;
  for (let r = radius; r < rows - radius; r++) {
    for (let c = radius; c < cols - radius; c++) {
      if (!src[r * cols + c]) continue;
      let ok = true;
      for (let nr = r - radius; nr <= r + radius && ok; nr++) {
        const dr = nr - r;
        for (let nc = c - radius; nc <= c + radius; nc++) {
          const dc = nc - c;
          if (dr * dr + dc * dc <= r2 && !src[nr * cols + nc]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) out[r * cols + c] = 1;
    }
  }
  return out;
}

function fillInteriorHoles(
  src: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const exterior = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  const pushIfEmpty = (idx: number) => {
    if (!src[idx] && !exterior[idx]) {
      exterior[idx] = 1;
      queue[tail++] = idx;
    }
  };
  for (let c = 0; c < cols; c++) {
    pushIfEmpty(c);
    pushIfEmpty((rows - 1) * cols + c);
  }
  for (let r = 0; r < rows; r++) {
    pushIfEmpty(r * cols);
    pushIfEmpty(r * cols + cols - 1);
  }
  while (head < tail) {
    const idx = queue[head++];
    const r = Math.floor(idx / cols);
    const c = idx - r * cols;
    if (c > 0) pushIfEmpty(idx - 1);
    if (c < cols - 1) pushIfEmpty(idx + 1);
    if (r > 0) pushIfEmpty(idx - cols);
    if (r < rows - 1) pushIfEmpty(idx + cols);
  }
  const out = new Uint8Array(cols * rows);
  for (let i = 0; i < out.length; i++) out[i] = exterior[i] ? 0 : 1;
  return out;
}

/** 4-connected component labels, 1-based (0 is empty), and their sizes. */
function labelComponents(
  src: Uint8Array,
  cols: number,
  rows: number,
): { labels: Int32Array; count: number; sizes: number[] } {
  const labels = new Int32Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  const sizes: number[] = [];
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    if (!src[i] || labels[i]) continue;
    const label = ++count;
    let head = 0;
    let tail = 0;
    labels[i] = label;
    queue[tail++] = i;
    while (head < tail) {
      const idx = queue[head++];
      const r = Math.floor(idx / cols);
      const c = idx - r * cols;
      const visit = (k: number) => {
        if (src[k] && !labels[k]) {
          labels[k] = label;
          queue[tail++] = k;
        }
      };
      if (c > 0) visit(idx - 1);
      if (c < cols - 1) visit(idx + 1);
      if (r > 0) visit(idx - cols);
      if (r < rows - 1) visit(idx + cols);
    }
    sizes.push(tail);
  }
  return { labels, count, sizes };
}

function keepLargestComponent(
  src: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const { labels, sizes } = labelComponents(src, cols, rows);
  const out = new Uint8Array(cols * rows);
  if (sizes.length === 0) return out;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let i = 0; i < src.length; i++) if (labels[i] === best + 1) out[i] = 1;
  return out;
}

function formatMetres(m: number): string {
  return `${m.toFixed(1)} m`;
}

/* --- 3D Wireframe Overlay ------------------------------------------------- */

function createDashedSegments(
  color: number,
  dashSize: number,
  gapSize: number,
): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(6));
  const material = new LineMaterial({
    color,
    linewidth: LINE_WIDTH_PX,
    dashed: true,
    dashSize,
    gapSize,
    dashScale: 1,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  return lines;
}

function setDashedSegmentPositions(
  lines: LineSegments2,
  segments: MeasureSegment[],
) {
  const count = Math.max(1, segments.length);
  const positions = new Float32Array(count * 6);
  const distances = new Float32Array(count * 2);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    positions[i * 6] = s.start.x;
    positions[i * 6 + 1] = s.start.y;
    positions[i * 6 + 2] = s.start.z;
    positions[i * 6 + 3] = s.end.x;
    positions[i * 6 + 4] = s.end.y;
    positions[i * 6 + 5] = s.end.z;
    // Start each segment at 0 so every edge begins cleanly with a dash at its corner.
    distances[i * 2] = 0;
    distances[i * 2 + 1] = s.lengthM;
  }

  lines.geometry.dispose();
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const distBuf = new InstancedInterleavedBuffer(distances, 2, 1);
  geometry.setAttribute(
    "instanceDistanceStart",
    new THREE.InterleavedBufferAttribute(distBuf, 1, 0),
  );
  geometry.setAttribute(
    "instanceDistanceEnd",
    new THREE.InterleavedBufferAttribute(distBuf, 1, 1),
  );
  geometry.instanceCount = segments.length;
  lines.geometry = geometry;
  lines.visible = segments.length > 0;
}

/**
 * Instanced screen-space blue corner squares: blue and square so they never
 * read as the red annotation markers.
 *
 * Uses clip-space `w` scaling directly rather than `THREE.Sprite`, because the
 * viewer switches to orthographic by replacing `PerspectiveCamera.projectionMatrix`
 * in place (leaving `isOrthographicCamera` false, which mis-scales `Sprite`).
 */
function createCornerMarkers() {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uSizePx: { value: CORNER_SIZE_PX },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform vec2 uResolution;
      uniform float uSizePx;
      varying vec2 vQuad;
      void main() {
        vQuad = position.xy;
        vec4 clipCenter = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 ndcOffset = position.xy * (uSizePx / max(uResolution, vec2(1.0)));
        gl_Position = vec4(clipCenter.xy + ndcOffset * clipCenter.w, clipCenter.z, clipCenter.w);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vQuad;
      void main() {
        float d = max(abs(vQuad.x), abs(vQuad.y));
        float aa = max(fwidth(d), 0.05);
        float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, d);
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(0.0, 0.0, 1.0, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  return { geometry, material, uniforms };
}

export interface RoomMeasureGizmoDeps {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  getModel: () => THREE.Object3D | null;
}

export function createRoomMeasureGizmo(deps: RoomMeasureGizmoDeps) {
  const group = new THREE.Group();
  // Slaved to `model.matrixWorld` per frame rather than parented under the
  // model, so annotation picking and orbit pivot raycasts never hit it.
  group.matrixAutoUpdate = false;
  group.visible = false;
  deps.scene.add(group);

  const verticalLines = createDashedSegments(
    GREEN,
    VERTICAL_DASH_SIZE_M,
    VERTICAL_GAP_SIZE_M,
  );
  verticalLines.renderOrder = 2;
  group.add(verticalLines);

  const horizontalLines = createDashedSegments(WHITE, DASH_SIZE_M, GAP_SIZE_M);
  horizontalLines.renderOrder = 3;
  group.add(horizontalLines);

  const markerResources = createCornerMarkers();
  let markersMesh: THREE.InstancedMesh | null = null;
  const dummyMatrix = new THREE.Matrix4();

  function clearMarkers() {
    if (!markersMesh) return;
    group.remove(markersMesh);
    markersMesh.dispose();
    markersMesh = null;
  }

  return {
    setMeasurement(measurement: RoomMeasurement | null) {
      if (!measurement) {
        group.visible = false;
        return;
      }

      setDashedSegmentPositions(
        horizontalLines,
        measurement.segments.filter((s) => s.kind === "horizontal"),
      );
      setDashedSegmentPositions(
        verticalLines,
        measurement.segments.filter((s) => s.kind === "vertical"),
      );

      clearMarkers();
      const corners = measurement.corners;
      if (corners.length > 0) {
        const mesh = new THREE.InstancedMesh(
          markerResources.geometry,
          markerResources.material,
          corners.length,
        );
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        corners.forEach((c, i) => {
          dummyMatrix.makeTranslation(c.x, c.y, c.z);
          mesh.setMatrixAt(i, dummyMatrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
        markersMesh = mesh;
      }
    },

    setVisible(visible: boolean) {
      group.visible = visible;
    },

    get visible() {
      return group.visible;
    },

    update() {
      if (!group.visible) return;
      const model = deps.getModel();
      if (!model) return;

      group.matrix.copy(model.matrixWorld);
      group.matrixWorldNeedsUpdate = true;

      const width = deps.renderer.domElement.clientWidth || 1;
      const height = deps.renderer.domElement.clientHeight || 1;
      horizontalLines.material.resolution.set(width, height);
      verticalLines.material.resolution.set(width, height);
      markerResources.uniforms.uResolution.value.set(width, height);
    },

    dispose() {
      clearMarkers();
      deps.scene.remove(group);
      horizontalLines.geometry.dispose();
      horizontalLines.material.dispose();
      verticalLines.geometry.dispose();
      verticalLines.material.dispose();
      markerResources.geometry.dispose();
      markerResources.material.dispose();
    },
  };
}

export type RoomMeasureGizmo = ReturnType<typeof createRoomMeasureGizmo>;
