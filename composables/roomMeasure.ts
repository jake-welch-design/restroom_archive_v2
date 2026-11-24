import * as THREE from "three";
import { InstancedInterleavedBuffer } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Room space measurement: traces a scan's 2D architectural floor footprint
 * (following L-shapes, alcoves, and angled walls), extrudes it from floor to
 * ceiling, and draws the wireframe prism in the viewer.
 *
 * Lazy-loaded when the visitor turns measurements on, for the same reason as
 * `cropGizmo.ts`: visitors who never open the tool pay for none of its
 * geometry or shaders.
 */

export interface RoomCorner2D {
  x: number;
  z: number;
}

export interface MeasureSegment {
  id: string;
  kind: "horizontal" | "vertical";
  start: THREE.Vector3;
  end: THREE.Vector3;
  lengthM: number;
  label: string;
}

export interface RoomMeasurement {
  /** Floor polygon vertices in CCW order, in levelled model-local XZ. */
  corners: RoomCorner2D[];
  minY: number;
  maxY: number;
  /** Floor area in square metres. */
  areaM2: number;
  /** Floor area in square feet. */
  areaSqFt: number;
  /** Every horizontal (floor + ceiling) and vertical edge of the prism. */
  segments: MeasureSegment[];
}

const SQM_TO_SQFT = 10.7639104167;

const WHITE = 0xffffff;
const GREEN = 0x22c55e;

const LINE_WIDTH_PX = 1.75;
const DOT_DIAMETER_PX = 8.5;
const DASH_SIZE_M = 0.08;
const GAP_SIZE_M = 0.06;

/** Shortest wall edge kept as its own cornered jog, in metres. */
const MIN_WALL_EDGE_M = 0.22;

/**
 * Extracts a clean 2D floor-plan polygon and floor-to-ceiling span from the
 * surviving geometry of `model` in `model`'s local space.
 *
 * Photogrammetry and LiDAR scans have holes in floors, missing ceilings,
 * bumpy walls, and arbitrary yaw angles in XZ. Projecting surviving triangles
 * onto a grid aligned with the scan's dominant wall angle, closing small scan
 * gaps, flood-filling interior floor holes from outside, and simplifying the
 * outer contour recovers crisp room corners without staircasing angled walls.
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

  model.updateMatrixWorld(true);
  const modelInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const toModel = new THREE.Matrix4();

  // Collected surviving triangles in model-local space: flat [ax, ay, az, bx, by, bz, cx, cy, cz, ...]
  const tris: number[] = [];
  const ptsXZ: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // 90-bin histogram over [0, pi/2) of horizontal wall normals, weighted by area.
  const BINS = 90;
  const hist = new Float64Array(BINS);
  const HALF_PI = Math.PI / 2;

  const pointSurvives = (p: THREE.Vector3): boolean => {
    if (keep && !keep.containsPoint(p)) return false;
    for (let i = 0; i < removals.length; i++) {
      if (removals[i].containsPoint(p)) return false;
    }
    return true;
  };

  const recordPoint = (p: THREE.Vector3) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  };

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count === 0) return;

    toModel.multiplyMatrices(modelInverse, mesh.matrixWorld);
    const index = mesh.geometry.index;
    const triCount = index
      ? Math.floor(index.count / 3)
      : Math.floor(pos.count / 3);

    if (triCount === 0) {
      for (let i = 0; i < pos.count; i++) {
        va.fromBufferAttribute(pos, i).applyMatrix4(toModel);
        if (pointSurvives(va)) {
          recordPoint(va);
          ptsXZ.push(va.x, va.z);
        }
      }
      return;
    }

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      va.fromBufferAttribute(pos, i0).applyMatrix4(toModel);
      vb.fromBufferAttribute(pos, i1).applyMatrix4(toModel);
      vc.fromBufferAttribute(pos, i2).applyMatrix4(toModel);

      const sa = pointSurvives(va);
      const sb = pointSurvives(vb);
      const sc = pointSurvives(vc);
      if (!sa && !sb && !sc) continue;

      // Clamp straddling triangles to `keep` so cropped edges stay sharp rather
      // than dropping large floor/wall triangles that cross a crop plane.
      if (keep && !(sa && sb && sc)) {
        // Skip if any vertex was removed by an explicit removal box.
        if (
          removals.some(
            (r) =>
              r.containsPoint(va) || r.containsPoint(vb) || r.containsPoint(vc),
          )
        )
          continue;
        keep.clampPoint(va, va);
        keep.clampPoint(vb, vb);
        keep.clampPoint(vc, vc);
      } else if (!(sa && sb && sc)) {
        continue;
      }

      recordPoint(va);
      recordPoint(vb);
      recordPoint(vc);

      tris.push(va.x, va.z, vb.x, vb.z, vc.x, vc.z);

      ab.subVectors(vb, va);
      ac.subVectors(vc, va);
      normal.crossVectors(ab, ac);
      const doubleArea = normal.length();
      if (doubleArea > 1e-7) {
        const nyRatio = Math.abs(normal.y) / doubleArea;
        if (nyRatio < 0.45) {
          let angle = Math.atan2(normal.z, normal.x) % HALF_PI;
          if (angle < 0) angle += HALF_PI;
          const bin = Math.min(BINS - 1, Math.floor((angle / HALF_PI) * BINS));
          hist[bin] += doubleArea;
        }
      }
    }
  });

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    if (!fallbackBox || fallbackBox.isEmpty()) return null;
    return buildPrismFromCorners(
      boxCorners(fallbackBox),
      fallbackBox.min.y,
      fallbackBox.max.y,
    );
  }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const maxSpan = Math.max(spanX, spanZ);
  if (maxSpan < 0.1) {
    const fb =
      fallbackBox && !fallbackBox.isEmpty()
        ? fallbackBox
        : new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ),
          );
    return buildPrismFromCorners(boxCorners(fb), minY, maxY);
  }

  // Dominant wall orientation theta in [0, pi/2), circularly smoothed.
  let bestBin = 0;
  let bestScore = -1;
  const kernel = [1, 2, 3, 2, 1];
  for (let b = 0; b < BINS; b++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) {
      sum += hist[(b + k + BINS) % BINS] * kernel[k + 2];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestBin = b;
    }
  }
  let sinSum = 0;
  let cosSum = 0;
  if (bestScore > 0) {
    for (let k = -4; k <= 4; k++) {
      const idx = (bestBin + k + BINS) % BINS;
      const w = hist[idx];
      const a4 = ((idx + 0.5) / BINS) * HALF_PI * 4;
      cosSum += w * Math.cos(a4);
      sinSum += w * Math.sin(a4);
    }
  }
  let theta = bestScore > 0 ? 0.25 * Math.atan2(sinSum, cosSum) : 0;
  if (theta < 0) theta += HALF_PI;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const toU = (x: number, z: number) => x * cosT + z * sinT;
  const toV = (x: number, z: number) => -x * sinT + z * cosT;
  const toX = (u: number, v: number) => u * cosT - v * sinT;
  const toZ = (u: number, v: number) => u * sinT + v * cosT;

  // Compute rotated bounds in (u, v).
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const rotTris = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 2) {
    const u = toU(tris[i], tris[i + 1]);
    const v = toV(tris[i], tris[i + 1]);
    rotTris[i] = u;
    rotTris[i + 1] = v;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  for (let i = 0; i < ptsXZ.length; i += 2) {
    const u = toU(ptsXZ[i], ptsXZ[i + 1]);
    const v = toV(ptsXZ[i], ptsXZ[i + 1]);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const spanU = maxU - minU;
  const spanV = maxV - minV;
  const cell = Math.max(0.04, Math.min(0.08, Math.max(spanU, spanV) / 110));
  const pad = 5;
  const cols = Math.max(8, Math.ceil(spanU / cell) + 1 + pad * 2);
  const rows = Math.max(8, Math.ceil(spanV / cell) + 1 + pad * 2);
  const originU = minU - pad * cell;
  const originV = minV - pad * cell;

  let grid: Uint8Array = new Uint8Array(cols * rows);

  // Rasterize 2D triangles onto the occupancy grid.
  for (let i = 0; i < rotTris.length; i += 6) {
    const u0 = rotTris[i];
    const v0 = rotTris[i + 1];
    const u1 = rotTris[i + 2];
    const v1 = rotTris[i + 3];
    const u2 = rotTris[i + 4];
    const v2 = rotTris[i + 5];

    const c0 = Math.max(0, Math.floor((Math.min(u0, u1, u2) - originU) / cell));
    const c1 = Math.min(
      cols - 1,
      Math.floor((Math.max(u0, u1, u2) - originU) / cell),
    );
    const r0 = Math.max(0, Math.floor((Math.min(v0, v1, v2) - originV) / cell));
    const r1 = Math.min(
      rows - 1,
      Math.floor((Math.max(v0, v1, v2) - originV) / cell),
    );

    if (c0 === c1 && r0 === r1) {
      grid[r0 * cols + c0] = 1;
      continue;
    }

    const halfCell = cell * 0.25;
    for (let r = r0; r <= r1; r++) {
      const py = originV + (r + 0.5) * cell;
      for (let c = c0; c <= c1; c++) {
        if (grid[r * cols + c]) continue;
        const px = originU + (c + 0.5) * cell;
        if (pointNearTriangle2D(px, py, u0, v0, u1, v1, u2, v2, halfCell)) {
          grid[r * cols + c] = 1;
        }
      }
    }
  }

  for (let i = 0; i < ptsXZ.length; i += 2) {
    const c = Math.floor((toU(ptsXZ[i], ptsXZ[i + 1]) - originU) / cell);
    const r = Math.floor((toV(ptsXZ[i], ptsXZ[i + 1]) - originV) / cell);
    if (c >= 0 && c < cols && r >= 0 && r < rows) grid[r * cols + c] = 1;
  }

  // Morphological closing bridges small wall/doorway scan gaps (~10 cm).
  const closeRadius = Math.max(1, Math.min(3, Math.round(0.1 / cell)));
  grid = erode(dilate(grid, cols, rows, closeRadius), cols, rows, closeRadius);

  // Fill interior holes (missing floor/ceiling patches) by flood-filling outside.
  grid = fillInteriorHoles(grid, cols, rows);

  // Keep only the main room footprint, dropping detached exterior fragments.
  grid = keepLargestComponent(grid, cols, rows);

  // Gentle 1-cell opening shaves off single-cell stray whiskers if non-empty.
  const opened = fillInteriorHoles(
    dilate(erode(grid, cols, rows, 1), cols, rows, 1),
    cols,
    rows,
  );
  if (countOccupied(opened) >= countOccupied(grid) * 0.7) {
    grid = keepLargestComponent(opened, cols, rows);
  }

  const rawLoop = traceOuterContour(grid, cols, rows, originU, originV, cell);
  if (rawLoop.length < 3) {
    const fb =
      fallbackBox && !fallbackBox.isEmpty()
        ? fallbackBox
        : new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ),
          );
    return buildPrismFromCorners(boxCorners(fb), minY, maxY);
  }

  const simplifiedUV = simplifyRoomPolygon(rawLoop, maxSpan);
  const corners: RoomCorner2D[] = simplifiedUV.map((p) => ({
    x: toX(p.u, p.v),
    z: toZ(p.u, p.v),
  }));

  if (corners.length < 3 || polygonArea(corners) < 0.05) {
    const fb =
      fallbackBox && !fallbackBox.isEmpty()
        ? fallbackBox
        : new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ),
          );
    return buildPrismFromCorners(boxCorners(fb), minY, maxY);
  }

  return buildPrismFromCorners(corners, minY, maxY);
}

interface UV {
  u: number;
  v: number;
}

function pointNearTriangle2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  // Signed edge functions: inside triangle of either winding, or within `radius` of any edge.
  const e0 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const e1 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const e2 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) {
    return true;
  }
  const r2 = radius * radius;
  return (
    distSqToSeg2D(px, py, ax, ay, bx, by) <= r2 ||
    distSqToSeg2D(px, py, bx, by, cx, cy) <= r2 ||
    distSqToSeg2D(px, py, cx, cy, ax, ay) <= r2
  );
}

function distSqToSeg2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

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
  for (let i = 0; i < out.length; i++) {
    out[i] = exterior[i] ? 0 : 1;
  }
  return out;
}

function keepLargestComponent(
  src: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const labels = new Int32Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let nextLabel = 0;
  let bestLabel = 0;
  let bestSize = 0;

  for (let i = 0; i < src.length; i++) {
    if (!src[i] || labels[i]) continue;
    const label = ++nextLabel;
    let head = 0;
    let tail = 0;
    labels[i] = label;
    queue[tail++] = i;

    while (head < tail) {
      const idx = queue[head++];
      const r = Math.floor(idx / cols);
      const c = idx - r * cols;
      if (c > 0 && src[idx - 1] && !labels[idx - 1]) {
        labels[idx - 1] = label;
        queue[tail++] = idx - 1;
      }
      if (c < cols - 1 && src[idx + 1] && !labels[idx + 1]) {
        labels[idx + 1] = label;
        queue[tail++] = idx + 1;
      }
      if (r > 0 && src[idx - cols] && !labels[idx - cols]) {
        labels[idx - cols] = label;
        queue[tail++] = idx - cols;
      }
      if (r < rows - 1 && src[idx + cols] && !labels[idx + cols]) {
        labels[idx + cols] = label;
        queue[tail++] = idx + cols;
      }
    }

    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = label;
    }
  }

  const out = new Uint8Array(cols * rows);
  if (!bestLabel) return out;
  for (let i = 0; i < src.length; i++) {
    if (labels[i] === bestLabel) out[i] = 1;
  }
  return out;
}

function countOccupied(grid: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i];
  return n;
}

/**
 * Walks the outer CCW boundary of the 4-connected mask along grid cell edges.
 *
 * Directions: 0 = +u (east), 1 = +v (north), 2 = -u (west), 3 = -v (south).
 * Keeping the occupied interior on the left of each directed edge traces a
 * simple Jordan polygon around the component.
 */
function traceOuterContour(
  grid: Uint8Array,
  cols: number,
  rows: number,
  originU: number,
  originV: number,
  cell: number,
): UV[] {
  let startC = -1;
  let startR = -1;
  for (let r = 0; r < rows && startR < 0; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c]) {
        startC = c;
        startR = r;
        break;
      }
    }
  }
  if (startC < 0) return [];

  const occ = (c: number, r: number) =>
    c >= 0 && c < cols && r >= 0 && r < rows ? grid[r * cols + c] === 1 : false;

  const du = [1, 0, -1, 0];
  const dv = [0, 1, 0, -1];

  // For a step in direction `dir` starting from grid vertex `(gu, gv)`, returns
  // whether the cell immediately to the left of that directed edge is occupied
  // and the cell to its right is empty.
  const isBoundaryEdge = (gu: number, gv: number, dir: number): boolean => {
    if (dir === 0) return occ(gu, gv) && !occ(gu, gv - 1);
    if (dir === 1) return occ(gu - 1, gv) && !occ(gu, gv);
    if (dir === 2) return occ(gu - 1, gv - 1) && !occ(gu - 1, gv);
    return occ(gu, gv - 1) && !occ(gu - 1, gv - 1);
  };

  let gu = startC;
  let gv = startR;
  let dir = 0; // Bottom edge of bottom-left occupied cell: interior (startC, startR) is on left.
  const loop: UV[] = [];
  const maxSteps = cols * rows * 4;

  for (let step = 0; step < maxSteps; step++) {
    // Cell-edge vertices sit 0.5 * cell outside the centres of the boundary
    // cells they wrap; shifting each edge's midpoint inward by 0.5 * cell
    // places the contour directly on the boundary cell centres.
    const midU = originU + (gu + 0.5 * du[dir] - 0.5 * dv[dir]) * cell;
    const midV = originV + (gv + 0.5 * dv[dir] + 0.5 * du[dir]) * cell;
    loop.push({ u: midU, v: midV });
    gu += du[dir];
    gv += dv[dir];
    if (gu === startC && gv === startR) break;

    // Turn right first so saddle vertices keep the 4-connected interior intact,
    // then straight, then left.
    const candidates = [(dir + 3) % 4, dir, (dir + 1) % 4];
    let chosen = (dir + 2) % 4;
    for (const nextDir of candidates) {
      if (isBoundaryEdge(gu, gv, nextDir)) {
        chosen = nextDir;
        break;
      }
    }
    dir = chosen;
  }

  return loop;
}

/**
 * Turns a dense grid contour into clean architectural walls and corners:
 * smooths 1-cell staircase steps on angled walls, simplifies with closed-loop
 * Ramer-Douglas-Peucker, merges near-collinear segments, snaps walls that are
 * nearly aligned with the dominant room axes, and intersects adjacent wall
 * lines for crisp corners.
 */
function simplifyRoomPolygon(raw: UV[], maxSpan: number): UV[] {
  // Smooth 1-cell staircasing (2 passes) while preserving sharp corners.
  let pts = raw;
  for (let pass = 0; pass < 2; pass++) {
    const n = pts.length;
    const next: UV[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const fwd = pts[(i + 1) % n];
      next[i] = {
        u: 0.25 * prev.u + 0.5 * cur.u + 0.25 * fwd.u,
        v: 0.25 * prev.v + 0.5 * cur.v + 0.25 * fwd.v,
      };
    }
    pts = next;
  }

  // Split closed loop at two mutually distant points for RDP.
  const n = pts.length;
  let idxA = 0;
  let bestD = -1;
  for (let i = 1; i < n; i++) {
    const d = hypotSq(pts[i], pts[0]);
    if (d > bestD) {
      bestD = d;
      idxA = i;
    }
  }
  let idxB = 0;
  bestD = -1;
  for (let i = 0; i < n; i++) {
    const d = hypotSq(pts[i], pts[idxA]);
    if (d > bestD) {
      bestD = d;
      idxB = i;
    }
  }

  const chain1: number[] = [];
  for (let i = idxA; i !== idxB; i = (i + 1) % n) chain1.push(i);
  chain1.push(idxB);

  const chain2: number[] = [];
  for (let i = idxB; i !== idxA; i = (i + 1) % n) chain2.push(i);
  chain2.push(idxA);

  const eps = Math.max(0.09, Math.min(0.15, maxSpan * 0.032));
  const keep1 = rdpIndices(pts, chain1, eps);
  const keep2 = rdpIndices(pts, chain2, eps);
  let cornerIndices = [...keep1.slice(0, -1), ...keep2.slice(0, -1)];

  // Iteratively drop short micro-edges and merge near-collinear walls.
  cornerIndices = cleanCornerIndices(pts, cornerIndices);
  if (cornerIndices.length < 3) {
    return cornerIndices.map((idx) => pts[idx]);
  }

  // Fit wall lines to the contour points along each segment, snapping walls
  // within 9 deg of the room's cardinal axes, and intersect consecutive walls.
  const snapped = fitAndIntersectWalls(pts, cornerIndices);
  if (snapped && snapped.length >= 3 && isSimplePolygonUV(snapped)) {
    return snapped;
  }
  return cornerIndices.map((idx) => pts[idx]);
}

function hypotSq(a: UV, b: UV): number {
  const du = a.u - b.u;
  const dv = a.v - b.v;
  return du * du + dv * dv;
}

function rdpIndices(pts: UV[], chain: number[], eps: number): number[] {
  if (chain.length <= 2) return chain;
  const a = pts[chain[0]];
  const b = pts[chain[chain.length - 1]];
  let maxDistSq = -1;
  let splitPos = -1;
  for (let i = 1; i < chain.length - 1; i++) {
    const p = pts[chain[i]];
    const dSq = distSqToSeg2D(p.u, p.v, a.u, a.v, b.u, b.v);
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      splitPos = i;
    }
  }
  if (maxDistSq > eps * eps && splitPos > 0) {
    const left = rdpIndices(pts, chain.slice(0, splitPos + 1), eps);
    const right = rdpIndices(pts, chain.slice(splitPos), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [chain[0], chain[chain.length - 1]];
}

function cleanCornerIndices(pts: UV[], indices: number[]): number[] {
  const cur = [...indices];
  const collinearCos = Math.cos((17 * Math.PI) / 180);

  for (let iter = 0; iter < 12 && cur.length > 3; iter++) {
    let changed = false;

    // 1. Drop any edge shorter than MIN_WALL_EDGE_M.
    for (let i = 0; i < cur.length && cur.length > 3; i++) {
      const a = pts[cur[i]];
      const b = pts[cur[(i + 1) % cur.length]];
      if (Math.hypot(b.u - a.u, b.v - a.v) < MIN_WALL_EDGE_M) {
        cur.splice((i + 1) % cur.length, 1);
        changed = true;
        break;
      }
    }
    if (changed) continue;

    // 2. Merge consecutive edges whose direction changes by < 17 degrees.
    for (let i = 0; i < cur.length && cur.length > 3; i++) {
      const prev = pts[cur[(i - 1 + cur.length) % cur.length]];
      const mid = pts[cur[i]];
      const next = pts[cur[(i + 1) % cur.length]];
      const d1u = mid.u - prev.u;
      const d1v = mid.v - prev.v;
      const d2u = next.u - mid.u;
      const d2v = next.v - mid.v;
      const l1 = Math.hypot(d1u, d1v);
      const l2 = Math.hypot(d2u, d2v);
      if (l1 < 1e-6 || l2 < 1e-6) {
        cur.splice(i, 1);
        changed = true;
        break;
      }
      const dot = (d1u * d2u + d1v * d2v) / (l1 * l2);
      if (dot > collinearCos) {
        cur.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  return cur;
}

interface Line2D {
  /** Unit normal (nx, nv) and offset c such that nx * u + nv * v = c. */
  nx: number;
  nv: number;
  c: number;
  length: number;
  snappedCardinal: boolean;
  fallbackEnd: UV;
}

function fitAndIntersectWalls(pts: UV[], cornerIndices: number[]): UV[] | null {
  const m = cornerIndices.length;
  const n = pts.length;
  const snapSin = Math.sin((9 * Math.PI) / 180);

  const lines: Line2D[] = [];
  for (let i = 0; i < m; i++) {
    const startIdx = cornerIndices[i];
    const endIdx = cornerIndices[(i + 1) % m];

    // Gather contour sample points along this wall (trimming 15% near corners
    // so rounded corner fillets do not bias the wall position).
    const samples: UV[] = [];
    for (let k = startIdx; k !== endIdx; k = (k + 1) % n) {
      samples.push(pts[k]);
    }
    samples.push(pts[endIdx]);

    const trim = samples.length >= 8 ? Math.floor(samples.length * 0.15) : 0;
    const core = samples.slice(trim, samples.length - trim);
    let meanU = 0;
    let meanV = 0;
    for (const p of core) {
      meanU += p.u;
      meanV += p.v;
    }
    meanU /= core.length;
    meanV /= core.length;

    const a = pts[startIdx];
    const b = pts[endIdx];
    let du = b.u - a.u;
    let dv = b.v - a.v;
    const segLen = Math.hypot(du, dv) || 1;
    du /= segLen;
    dv /= segLen;

    // Snap near-cardinal walls in (u, v) to exact horizontal/vertical.
    let snappedCardinal = false;
    if (Math.abs(dv) <= snapSin) {
      dv = 0;
      du = du >= 0 ? 1 : -1;
      snappedCardinal = true;
    } else if (Math.abs(du) <= snapSin) {
      du = 0;
      dv = dv >= 0 ? 1 : -1;
      snappedCardinal = true;
    }

    const nx = -dv;
    const nv = du;
    lines.push({
      nx,
      nv,
      c: nx * meanU + nv * meanV,
      length: segLen,
      snappedCardinal,
      fallbackEnd: b,
    });
  }

  // Drop short diagonal chamfers (< 0.36 m) across unscanned corners between
  // two perpendicular cardinal walls so those two walls meet at a crisp corner.
  for (let pass = 0; pass < 4 && lines.length > 3; pass++) {
    let removed = false;
    for (let i = 0; i < lines.length && lines.length > 3; i++) {
      const cur = lines[i];
      if (cur.snappedCardinal || cur.length >= 0.36) continue;
      const prev = lines[(i - 1 + lines.length) % lines.length];
      const next = lines[(i + 1) % lines.length];
      if (
        prev.snappedCardinal &&
        next.snappedCardinal &&
        Math.abs(prev.nx * next.nx + prev.nv * next.nv) < 0.1
      ) {
        lines.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }

  // Merge consecutive lines that snapped to the same orientation.
  const merged: Line2D[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.nx * line.nv - prev.nv * line.nx) < 0.05 &&
      prev.nx * line.nx + prev.nv * line.nv > 0
    ) {
      prev.c = 0.5 * (prev.c + line.c);
      prev.fallbackEnd = line.fallbackEnd;
    } else {
      merged.push({ ...line });
    }
  }
  if (
    merged.length > 3 &&
    Math.abs(
      merged[0].nx * merged[merged.length - 1].nv -
        merged[0].nv * merged[merged.length - 1].nx,
    ) < 0.05 &&
    merged[0].nx * merged[merged.length - 1].nx +
      merged[0].nv * merged[merged.length - 1].nv >
      0
  ) {
    merged[0].c = 0.5 * (merged[0].c + merged[merged.length - 1].c);
    merged.pop();
  }

  if (merged.length < 3) return null;

  // Intersect each wall line `i` with `i + 1`.
  const out: UV[] = [];
  for (let i = 0; i < merged.length; i++) {
    const l1 = merged[i];
    const l2 = merged[(i + 1) % merged.length];
    const det = l1.nx * l2.nv - l1.nv * l2.nx;
    if (Math.abs(det) < 0.15) {
      out.push(l1.fallbackEnd);
      continue;
    }
    const u = (l1.c * l2.nv - l1.nv * l2.c) / det;
    const v = (l1.nx * l2.c - l1.c * l2.nx) / det;
    if (Math.hypot(u - l1.fallbackEnd.u, v - l1.fallbackEnd.v) > 0.6) {
      return null;
    }
    out.push({ u, v });
  }

  // Reject if intersection collapsed any wall below threshold.
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[(i + 1) % out.length];
    if (Math.hypot(b.u - a.u, b.v - a.v) < MIN_WALL_EDGE_M * 0.75) {
      return null;
    }
  }

  return out;
}

function isSimplePolygonUV(poly: UV[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = poly[j];
      const b2 = poly[(j + 1) % n];
      if (segmentsIntersectProper(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function segmentsIntersectProper(a1: UV, a2: UV, b1: UV, b2: UV): boolean {
  const cross = (o: UV, p: UV, q: UV) =>
    (p.u - o.u) * (q.v - o.v) - (p.v - o.v) * (q.u - o.u);
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return (
    ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) &&
    ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))
  );
}

function boxCorners(box: THREE.Box3): RoomCorner2D[] {
  return [
    { x: box.min.x, z: box.min.z },
    { x: box.max.x, z: box.min.z },
    { x: box.max.x, z: box.max.z },
    { x: box.min.x, z: box.max.z },
  ];
}

function polygonArea(corners: RoomCorner2D[]): number {
  let twice = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) * 0.5;
}

function formatMetres(m: number): string {
  return `${m.toFixed(1)} m`;
}

function buildPrismFromCorners(
  corners: RoomCorner2D[],
  minY: number,
  maxY: number,
): RoomMeasurement {
  const areaM2 = polygonArea(corners);
  const areaSqFt = areaM2 * SQM_TO_SQFT;
  const heightM = Math.max(0, maxY - minY);
  const segments: MeasureSegment[] = [];
  const n = corners.length;

  for (let i = 0; i < n; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const label = formatMetres(len);

    segments.push({
      id: `floor-${i}`,
      kind: "horizontal",
      start: new THREE.Vector3(a.x, minY, a.z),
      end: new THREE.Vector3(b.x, minY, b.z),
      lengthM: len,
      label,
    });
    segments.push({
      id: `ceil-${i}`,
      kind: "horizontal",
      start: new THREE.Vector3(a.x, maxY, a.z),
      end: new THREE.Vector3(b.x, maxY, b.z),
      lengthM: len,
      label,
    });
    segments.push({
      id: `vert-${i}`,
      kind: "vertical",
      start: new THREE.Vector3(a.x, minY, a.z),
      end: new THREE.Vector3(a.x, maxY, a.z),
      lengthM: heightM,
      label: formatMetres(heightM),
    });
  }

  return { corners, minY, maxY, areaM2, areaSqFt, segments };
}

/* --- 3D Wireframe Overlay ------------------------------------------------- */

function createDashedSegments(color: number): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(6));
  const material = new LineMaterial({
    color,
    linewidth: LINE_WIDTH_PX,
    dashed: true,
    dashSize: DASH_SIZE_M,
    gapSize: GAP_SIZE_M,
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
 * Instanced screen-space red corner discs.
 *
 * Uses clip-space `w` scaling directly rather than `THREE.Sprite`, because the
 * viewer switches to orthographic by replacing `PerspectiveCamera.projectionMatrix`
 * in place (leaving `isOrthographicCamera` false, which mis-scales `Sprite`).
 */
function createCornerDots() {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDiameterPx: { value: DOT_DIAMETER_PX },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform vec2 uResolution;
      uniform float uDiameterPx;
      varying vec2 vQuad;
      void main() {
        vQuad = position.xy;
        vec4 clipCenter = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 ndcOffset = position.xy * (uDiameterPx / max(uResolution, vec2(1.0)));
        gl_Position = vec4(clipCenter.xy + ndcOffset * clipCenter.w, clipCenter.z, clipCenter.w);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vQuad;
      void main() {
        float d = length(vQuad);
        float aa = max(fwidth(d), 0.05);
        float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, d);
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(1.0, 0.0, 0.0, alpha);
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

  const verticalLines = createDashedSegments(GREEN);
  verticalLines.renderOrder = 2;
  group.add(verticalLines);

  const horizontalLines = createDashedSegments(WHITE);
  horizontalLines.renderOrder = 3;
  group.add(horizontalLines);

  const dotResources = createCornerDots();
  let dotsMesh: THREE.InstancedMesh | null = null;
  const dummyMatrix = new THREE.Matrix4();

  function clearDots() {
    if (!dotsMesh) return;
    group.remove(dotsMesh);
    dotsMesh.dispose();
    dotsMesh = null;
  }

  return {
    setMeasurement(measurement: RoomMeasurement | null) {
      if (!measurement) {
        group.visible = false;
        return;
      }

      const horizontals = measurement.segments.filter(
        (s) => s.kind === "horizontal",
      );
      const verticals = measurement.segments.filter(
        (s) => s.kind === "vertical",
      );
      setDashedSegmentPositions(horizontalLines, horizontals);
      setDashedSegmentPositions(verticalLines, verticals);

      clearDots();
      const totalCorners = measurement.corners.length * 2;
      if (totalCorners > 0) {
        dotsMesh = new THREE.InstancedMesh(
          dotResources.geometry,
          dotResources.material,
          totalCorners,
        );
        dotsMesh.frustumCulled = false;
        dotsMesh.renderOrder = 4;
        let idx = 0;
        for (const c of measurement.corners) {
          dummyMatrix.makeTranslation(c.x, measurement.minY, c.z);
          dotsMesh.setMatrixAt(idx++, dummyMatrix);
          dummyMatrix.makeTranslation(c.x, measurement.maxY, c.z);
          dotsMesh.setMatrixAt(idx++, dummyMatrix);
        }
        dotsMesh.instanceMatrix.needsUpdate = true;
        group.add(dotsMesh);
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
      dotResources.uniforms.uResolution.value.set(width, height);
    },

    dispose() {
      clearDots();
      deps.scene.remove(group);
      horizontalLines.geometry.dispose();
      horizontalLines.material.dispose();
      verticalLines.geometry.dispose();
      verticalLines.material.dispose();
      dotResources.geometry.dispose();
      dotResources.material.dispose();
    },
  };
}

export type RoomMeasureGizmo = ReturnType<typeof createRoomMeasureGizmo>;
