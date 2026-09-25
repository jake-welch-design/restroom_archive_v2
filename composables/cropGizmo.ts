import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { MIN_CROP_SIZE } from "~~/shared/utils/crop";

/**
 * The draggable crop box an admin uses to trim a scan.
 *
 * Not a Vue composable despite living here: it is created once by
 * `useThreeScene` with the scene objects it needs and driven imperatively from
 * the same pointer handlers and animation loop. Kept out of `useThreeScene.ts`
 * because the drag maths, the handle drawing and the per-frame sizing are
 * self-contained and that file is long enough already.
 *
 * Everything it draws is expressed in the model's local space, and the whole
 * group is slaved to the model's world matrix each frame (see `update`). That
 * keeps the box registered to the geometry however the model is positioned, and
 * means the box the admin drags is directly the box that gets stored, with no
 * coordinate conversion at the point of saving.
 */

/** Diameter of a handle's visible disc, in CSS pixels, at any zoom. */
const HANDLE_VISIBLE_PX = 16;

/**
 * Diameter of the area that picks a handle up, in CSS pixels.
 *
 * Wider than the disc on purpose. The sprite is drawn at this size with a
 * transparent margin around the disc, and the raycaster tests the whole quad,
 * so a press that lands just off the disc still takes the handle rather than
 * orbiting the scan out from under it.
 */
const HANDLE_HIT_PX = 26;

/**
 * The POV eye dot's visible diameter and pick diameter, in CSS pixels.
 *
 * Larger than a face handle so the two are told apart by size as well as by the
 * dot's pupil, and so the one control that is not about the box's shape does
 * not get lost among the six that are.
 */
const POV_VISIBLE_PX = 20;
const POV_HIT_PX = 30;

/** Width of the vertical guide the POV dot slides along, in CSS pixels. */
const SHAFT_WIDTH_PX = 2;

/**
 * How close, in CSS pixels, a press has to land to the guide to take it. Tested
 * on screen for the same reason as a ring (see ringUnderPointer).
 */
const SHAFT_HIT_PX = 8;

/**
 * Below this |view · up|, in local space, the camera is too close to level for
 * a horizontal drag plane: the pointer ray grazes it and the hit runs off to
 * the horizon. The guide is then moved across a plane facing the camera
 * instead, which follows the pointer sideways but not in depth.
 */
const SHAFT_LEVEL_VIEW = 0.2;

/**
 * How close the POV eye may get to any side of the frame, in model units. An
 * eye flush with the floor, or a wall, would be looking out through it.
 */
export const POV_EDGE_MARGIN = 0.05;

/** `v` kept at least POV_EDGE_MARGIN inside [min, max], or centred if it can't be. */
export function clampInsideEdges(v: number, min: number, max: number): number {
  const low = min + POV_EDGE_MARGIN;
  const high = max - POV_EDGE_MARGIN;
  // A frame shorter than two margins has no room either side; sit in it.
  if (low > high) return (min + max) / 2;
  return Math.min(Math.max(v, low), high);
}

/** Width of the corner brackets and of the full edges, in CSS pixels. */
const BRACKET_WIDTH_PX = 3;
const EDGE_WIDTH_PX = 1;

/** How far a corner bracket runs along each edge, as a fraction of the box. */
const BRACKET_FRACTION = 0.16;

/** Ceiling on that, so a short axis does not end up bracket from end to end. */
const BRACKET_MAX_FRACTION = 0.38;

const WHITE = 0xffffff;
const ACCENT = 0xff0000;

/**
 * How much of the box's walls show, at rest and for the face being dragged.
 *
 * Faint enough that the scan reads through them. They are depth-tested against
 * the scan, unlike the rest of the gizmo, which is what makes them useful: a
 * wall is hidden wherever geometry stands in front of it, so it reads as a
 * pane of glass cutting through the room, and where it passes through a
 * surface the line of the cut is visible.
 */
const WALL_OPACITY = 0.1;
const WALL_DRAG_OPACITY = 0.24;

/* --- Rotate mode --------------------------------------------------------- */

/** Segments per rotation ring. Enough that none reads as a polygon up close. */
const RING_SEGMENTS = 96;
const RING_WIDTH_PX = 2;

/** How close, in CSS pixels, a press has to land to a ring to take it. */
const RING_HIT_PX = 10;

/** Ring radius as a fraction of the scan's largest dimension. */
const RING_RADIUS_FACTOR = 0.6;

/** Lines per side of the level grid, and how far it reaches past the rings. */
const GRID_DIVISIONS = 10;
const GRID_REACH = 1.15;

/**
 * Quarter turns snap, within a few degrees. That is what fixes a scan exported
 * with the wrong up axis, which arrives lying on its side or face down. Zero is
 * deliberately not a snap point: levelling is mostly corrections of a degree or
 * two, which a snap at zero would swallow.
 */
const SNAP_STEP = Math.PI / 2;
const SNAP_WITHIN = (3 * Math.PI) / 180;

/**
 * How squarely a ring must face the camera, as |axis · view|, to be turned by
 * circling the pointer round its centre. Below this it is turned by dragging
 * its near side instead. See beginRotate.
 */
const FACE_ON_FACING = 0.75;

export type RotateAxis = "x" | "y" | "z";
export type CropGizmoTool = "box" | "rotate";

/** The six faces, as an axis and which end of it the face sits at. */
const FACES = [
  { axis: "x", end: "min" },
  { axis: "x", end: "max" },
  { axis: "y", end: "min" },
  { axis: "y", end: "max" },
  { axis: "z", end: "min" },
  { axis: "z", end: "max" },
] as const;

type Axis = (typeof FACES)[number]["axis"];
type FaceEnd = (typeof FACES)[number]["end"];

interface Face {
  axis: Axis;
  end: FaceEnd;
  handle: THREE.Sprite;
  wall: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

/**
 * Anything the pointer can pick up: one of the six faces, the POV dot, which
 * sets the eye's height, or the guide it slides on, which sets where it stands.
 */
type Grip = Face | "pov" | "shaft";

export interface CropGizmoDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  getModel: () => THREE.Object3D | null;
  /** Called whenever a drag changes the box, so the caller can re-clip live. */
  onChange: (box: THREE.Box3) => void;
  /** Called when the POV dot is dragged, with its new model-local height. */
  onPovChange: (y: number) => void;
  /** Called when the POV guide is dragged, with where it now stands, locally. */
  onShaftMove: (x: number, z: number) => void;
  /**
   * Called once when a face drag is released.
   *
   * For work too heavy to redo on every drag frame: in `remove` mode the POV
   * guide's position depends on what geometry survives, which means walking
   * the scan's vertices.
   */
  onDragEnd: () => void;
  /**
   * Called as a ring is dragged, with the axis and the total angle turned since
   * the drag began, snapped. The caller turns the scan; the rings stay put.
   */
  onRotate: (axis: RotateAxis, angle: number) => void;
  /** Called once when a ring drag is released. */
  onRotateEnd: () => void;
}

/**
 * The handle's image: a white disc with a dark ring, inside a transparent
 * margin that widens the pick area (see HANDLE_HIT_PX).
 *
 * White rather than coloured so a material tint can recolour it: the tint
 * multiplies, so the disc takes the accent on hover while the ring stays dark.
 * The ring is what keeps a white handle readable against a white wall, where a
 * bare disc would vanish into the texture behind it.
 */
function createHandleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const centre = size / 2;
    const outer = (size * (HANDLE_VISIBLE_PX / HANDLE_HIT_PX)) / 2;
    const ring = outer * 0.2;
    ctx.beginPath();
    ctx.arc(centre, centre, outer, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centre, centre, outer - ring, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The POV dot's image: the handle's disc with a dark pupil in the middle.
 *
 * The pupil is what separates it from a face handle at a glance, and it keeps
 * the same tinting trick: the white takes the accent on hover while the ring
 * and pupil stay dark.
 */
function createPovTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const centre = size / 2;
    const outer = (size * (POV_VISIBLE_PX / POV_HIT_PX)) / 2;
    ctx.beginPath();
    ctx.arc(centre, centre, outer, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centre, centre, outer * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centre, centre, outer * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A set of screen-space-width line segments with a fixed segment count.
 *
 * `LineSegments2` rather than `LineSegments` because `linewidth` on a plain
 * `LineBasicMaterial` is ignored by WebGL on every platform that matters: every
 * line is one pixel, so the corner brackets could only ever be told apart from
 * the edges by brightness, which at one pixel is hardly anything.
 */
function createLines(segments: number, width: number, opacity: number) {
  const geometry = new LineSegmentsGeometry();
  // Allocated once at its final size. `setPositions` builds a new GPU buffer
  // every time it is called, and redrawing through it on each drag frame would
  // leak one per frame; `writeSegments` fills this one in place instead.
  geometry.setPositions(new Float32Array(segments * 6));
  const material = new LineMaterial({
    color: WHITE,
    linewidth: width,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
  const lines = new LineSegments2(geometry, material);
  // The geometry's bounding sphere is computed once, for the zeroed buffer
  // above, and never again, so culling against it would drop the box.
  lines.frustumCulled = false;
  return lines;
}

function writeSegments(lines: LineSegments2, values: Float32Array) {
  const attribute = lines.geometry.getAttribute(
    "instanceStart",
  ) as THREE.InterleavedBufferAttribute;
  (attribute.data.array as Float32Array).set(values);
  attribute.data.needsUpdate = true;
}

export function createCropGizmo(deps: CropGizmoDeps) {
  const group = new THREE.Group();
  // Driven from the model's world matrix in `update` rather than by parenting
  // the group to the model. Parenting would put the handles inside the object
  // that `pickPoint` and the orbit pivot probe raycast against, and an
  // annotation would land on a handle instead of the wall behind it.
  group.matrixAutoUpdate = false;
  group.visible = false;
  deps.scene.add(group);

  /** The box being edited, in model-local space. */
  const box = new THREE.Box3();
  /** The scan's own bounds, which the box may never grow past. */
  const bounds = new THREE.Box3();

  /* --- Drawing objects ---------------------------------------------------- */

  // Everything here is drawn without depth testing. A crop box sits by
  // definition at the surface it is about to cut, so depth-testing it leaves
  // its edges and handles z-fighting with, or hidden behind, the geometry they
  // are there to trim.
  const edges = createLines(12, EDGE_WIDTH_PX, 0.45);
  edges.renderOrder = 2;
  group.add(edges);

  const brackets = createLines(8 * 3, BRACKET_WIDTH_PX, 1);
  brackets.renderOrder = 3;
  group.add(brackets);

  const wallGeometry = new THREE.PlaneGeometry(1, 1);

  const handleTexture = createHandleTexture();

  // Sprites, so every handle faces the camera. A handle drawn flat on its face
  // foreshortens as the camera comes round, and seen edge-on it is a sliver no
  // wider than a line: visible in principle, unclickable in practice, and the
  // face it belongs to cannot be moved from that angle at all.
  const faces: Face[] = FACES.map(({ axis, end }) => {
    const handle = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: handleTexture,
        color: WHITE,
        // Constant on-screen size regardless of distance, which `update`
        // converts from CSS pixels. The raycaster honours this too, so the pick
        // area stays the same size as the camera dollies.
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    handle.renderOrder = 4;
    group.add(handle);

    const wall = new THREE.Mesh(
      wallGeometry,
      new THREE.MeshBasicMaterial({
        color: WHITE,
        transparent: true,
        opacity: WALL_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
        // Pulled towards the camera in depth. A wall at the scan's full bounds
        // lies exactly on its outermost geometry, a floor most of all, and
        // without the offset the two would z-fight into a shimmer.
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    // Only three orientations exist, as for the handles before they were
    // sprites; the material is double-sided, so which way each faces is moot.
    if (axis === "x") wall.rotation.set(0, Math.PI / 2, 0);
    else if (axis === "y") wall.rotation.set(Math.PI / 2, 0, 0);
    wall.renderOrder = 1;
    group.add(wall);

    return { axis, end, handle, wall };
  });

  const handles = faces.map((f) => f.handle);

  // The guide the POV eye slides along: a vertical line from the floor of the
  // box the viewer will frame on to its ceiling, standing where POV stands. It
  // starts at the frame's centre; dragging the line moves it anywhere inside
  // the frame, and dragging the dot on it sets the eye's height.
  const shaft = createLines(1, SHAFT_WIDTH_PX, 0.75);
  shaft.renderOrder = 3;
  group.add(shaft);

  const povTexture = createPovTexture();
  const povDot = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: povTexture,
      color: WHITE,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  povDot.renderOrder = 5;
  group.add(povDot);

  const grips = [...handles, povDot];

  // Rotate mode. Three rings about the scan's pivot and a level grid at its
  // floor. They live in the same levelled space as the box, so while the scan
  // turns beneath them they stay upright, which is what makes them a reference.
  const rings: Record<RotateAxis, LineSegments2> = {
    x: createLines(RING_SEGMENTS, RING_WIDTH_PX, 0.9),
    y: createLines(RING_SEGMENTS, RING_WIDTH_PX, 0.9),
    z: createLines(RING_SEGMENTS, RING_WIDTH_PX, 0.9),
  };
  for (const ring of Object.values(rings)) {
    ring.renderOrder = 4;
    group.add(ring);
  }

  // Depth-tested, unlike the rings. A floor that is not level passes through a
  // level grid, sinking under it on one side and rising over it on the other,
  // and that crossing is the clearest sign there is of which way it tips.
  const grid = createLines((GRID_DIVISIONS + 1) * 2, 1, 0.35);
  grid.material.depthTest = true;
  grid.renderOrder = 1;
  group.add(grid);

  const boxParts: THREE.Object3D[] = [
    edges,
    brackets,
    shaft,
    povDot,
    ...faces.flatMap((f) => [f.handle, f.wall]),
  ];
  const rotateParts: THREE.Object3D[] = [...Object.values(rings), grid];

  /* --- State -------------------------------------------------------------- */

  let hovered: Grip | null = null;
  let dragging: Grip | null = null;

  let tool: CropGizmoTool = "box";
  const ringCentre = new THREE.Vector3();
  let ringRadius = 1;
  let hoveredRing: RotateAxis | null = null;

  /**
   * A ring drag in progress. `plane` reads the pointer's angle about the centre
   * in the ring's own plane; `tangent`, for a ring seen nearly edge-on, reads
   * its travel along the ring's tangent where it was grabbed.
   */
  let rotating:
    | {
        axis: RotateAxis;
        method: "circle";
        /** The ring's centre on screen, in canvas pixels. */
        centreX: number;
        centreY: number;
        /** +1 when the axis points at the camera, −1 when away. */
        sign: number;
        previous: number;
        total: number;
      }
    | {
        axis: RotateAxis;
        method: "tangent";
        /** Where the drag began, on a plane through the centre facing the camera. */
        origin: THREE.Vector3;
        /** The direction the ring's near side moves for a positive turn. */
        tangent: THREE.Vector3;
        total: number;
      }
    | null = null;
  const rotatePlane = new THREE.Plane();

  /**
   * The POV guide: where it stands, the frame it has to stay inside (and runs
   * from floor to ceiling of), and where the eye is on it.
   */
  const shaftFrame = {
    x: 0,
    z: 0,
    min: new THREE.Vector3(),
    max: new THREE.Vector3(),
  };
  let povY = 0;
  const shaftValues = new Float32Array(6);
  /** Where a guide drag began: the pointer on the drag plane, and the guide. */
  const shaftDragStart = new THREE.Vector3();
  let shaftStartX = 0;
  let shaftStartZ = 0;

  /** Local-space plane the pointer is projected onto for the current drag. */
  const dragPlane = new THREE.Plane();
  /** Where along the drag axis the gesture started, and the face's value then. */
  let dragStartAlongAxis = 0;
  let dragStartValue = 0;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const inverseModel = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const scratch = new THREE.Vector3();
  const localAxis = new THREE.Vector3();
  const localViewDir = new THREE.Vector3();
  const edgeValues = new Float32Array(12 * 6);
  const bracketValues = new Float32Array(8 * 3 * 6);

  /* --- Drawing ------------------------------------------------------------ */

  function faceValue(face: Face): number {
    return (face.end === "min" ? box.min : box.max)[face.axis];
  }

  /** The face's centre, in local space. */
  function faceCentre(face: Face, out: THREE.Vector3): THREE.Vector3 {
    box.getCenter(out);
    out[face.axis] = faceValue(face);
    return out;
  }

  function writeEdges() {
    const { min, max } = box;
    const c = [
      [min.x, min.y, min.z],
      [max.x, min.y, min.z],
      [max.x, max.y, min.z],
      [min.x, max.y, min.z],
      [min.x, min.y, max.z],
      [max.x, min.y, max.z],
      [max.x, max.y, max.z],
      [min.x, max.y, max.z],
    ];
    const pairs = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    let i = 0;
    for (const [a, b] of pairs) {
      edgeValues.set(c[a], i);
      edgeValues.set(c[b], i + 3);
      i += 6;
    }
    writeSegments(edges, edgeValues);
  }

  function writeBrackets() {
    const size = box.getSize(scratch);
    const shortest = Math.min(size.x, size.y, size.z);

    let i = 0;
    for (const xEnd of ["min", "max"] as const)
      for (const yEnd of ["min", "max"] as const)
        for (const zEnd of ["min", "max"] as const) {
          const corner: Record<Axis, number> = {
            x: box[xEnd].x,
            y: box[yEnd].y,
            z: box[zEnd].z,
          };
          const ends: Record<Axis, FaceEnd> = { x: xEnd, y: yEnd, z: zEnd };

          for (const axis of ["x", "y", "z"] as const) {
            // Capped against this axis as well as the shortest one, so a box
            // that is thin in one direction does not get brackets meeting in
            // the middle of its long edges.
            const length = Math.min(
              shortest * BRACKET_FRACTION,
              size[axis] * BRACKET_MAX_FRACTION,
            );
            const towardInterior = ends[axis] === "min" ? 1 : -1;
            bracketValues.set([corner.x, corner.y, corner.z], i);
            const to = { ...corner };
            to[axis] += towardInterior * length;
            bracketValues.set([to.x, to.y, to.z], i + 3);
            i += 6;
          }
        }
    writeSegments(brackets, bracketValues);
  }

  function positionHandles() {
    for (const face of faces) faceCentre(face, face.handle.position);
  }

  /** Sizes and places each wall to fill its face of the box. */
  function writeWalls() {
    const size = box.getSize(scratch);
    for (const face of faces) {
      faceCentre(face, face.wall.position);
      if (face.axis === "x") face.wall.scale.set(size.z, size.y, 1);
      else if (face.axis === "y") face.wall.scale.set(size.x, size.z, 1);
      else face.wall.scale.set(size.x, size.y, 1);
    }
  }

  function redraw() {
    writeEdges();
    writeBrackets();
    writeWalls();
    positionHandles();
  }

  function clampPov(y: number): number {
    return clampInsideEdges(y, shaftFrame.min.y, shaftFrame.max.y);
  }

  function writeShaft() {
    const { x, z, min, max } = shaftFrame;
    shaftValues.set([x, min.y, z, x, max.y, z]);
    writeSegments(shaft, shaftValues);
    povDot.position.set(x, povY, z);
  }

  function setGripHighlight(grip: Grip | null) {
    for (const f of faces)
      f.handle.material.color.setHex(f === grip ? ACCENT : WHITE);
    povDot.material.color.setHex(grip === "pov" ? ACCENT : WHITE);
    shaft.material.color.setHex(grip === "shaft" ? ACCENT : WHITE);
  }

  /** The axis a dot or face drag slides along. The guide has its own drag. */
  function gripAxis(grip: Face | "pov"): Axis {
    return grip === "pov" ? "y" : grip.axis;
  }

  function gripValue(grip: Face | "pov"): number {
    return grip === "pov" ? povY : faceValue(grip);
  }

  function gripCentre(grip: Face | "pov", out: THREE.Vector3): THREE.Vector3 {
    return grip === "pov"
      ? out.set(shaftFrame.x, povY, shaftFrame.z)
      : faceCentre(grip, out);
  }

  const AXIS_VECTORS: Record<RotateAxis, THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };

  /** A point on the ring about `axis`, at `t` radians round it, in local space. */
  function ringPoint(axis: RotateAxis, t: number, out: THREE.Vector3) {
    const a = ringRadius * Math.cos(t);
    const b = ringRadius * Math.sin(t);
    if (axis === "x") out.set(0, a, b);
    else if (axis === "y") out.set(a, 0, b);
    else out.set(a, b, 0);
    return out.add(ringCentre);
  }

  function writeRings() {
    const values = new Float32Array(RING_SEGMENTS * 6);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    for (const axis of ["x", "y", "z"] as const) {
      for (let i = 0; i < RING_SEGMENTS; i++) {
        ringPoint(axis, (i / RING_SEGMENTS) * Math.PI * 2, from);
        ringPoint(axis, ((i + 1) / RING_SEGMENTS) * Math.PI * 2, to);
        values.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
      }
      writeSegments(rings[axis], values);
    }
  }

  function writeGrid(floorY: number) {
    const half = ringRadius * GRID_REACH;
    const y = floorY;
    const values = new Float32Array((GRID_DIVISIONS + 1) * 2 * 6);
    let i = 0;
    for (let k = 0; k <= GRID_DIVISIONS; k++) {
      const offset = -half + (2 * half * k) / GRID_DIVISIONS;
      const x = ringCentre.x + offset;
      const z = ringCentre.z + offset;
      values.set([x, y, ringCentre.z - half, x, y, ringCentre.z + half], i);
      values.set([ringCentre.x - half, y, z, ringCentre.x + half, y, z], i + 6);
      i += 12;
    }
    writeSegments(grid, values);
  }

  function setRingHighlight(axis: RotateAxis | null) {
    for (const [key, ring] of Object.entries(rings))
      ring.material.color.setHex(key === axis ? ACCENT : WHITE);
  }

  function applyToolVisibility() {
    for (const part of boxParts) part.visible = tool === "box";
    for (const part of rotateParts) part.visible = tool === "rotate";
  }

  /** Brings up the wall of the face being dragged, so the cut is easy to follow. */
  function emphasiseWall(face: Face | null) {
    for (const f of faces)
      f.wall.material.opacity = f === face ? WALL_DRAG_OPACITY : WALL_OPACITY;
  }

  /* --- Hit testing and dragging ------------------------------------------- */

  function setPointer(event: PointerEvent) {
    const rect = deps.renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Also what gives the raycaster the camera sprites need to be tested at all.
    raycaster.setFromCamera(pointer, deps.camera);
  }

  function gripUnderPointer(event: PointerEvent): Grip | null {
    setPointer(event);
    const hits = raycaster.intersectObjects(grips, false);
    // The POV dot wins wherever it overlaps a handle. It sits on the box's
    // centre line, which from above or below is exactly where the top and
    // bottom face handles project, and drawn on top of them it is the one the
    // admin can see and is aiming at.
    if (hits.some((h) => h.object === povDot)) return "pov";
    // Otherwise nearest first, so where two handles overlap on screen the one
    // closer to the camera wins, which is the one drawn on top.
    const hit = hits[0];
    if (hit) return faces.find((f) => f.handle === hit.object) ?? null;
    // The guide last: in `keep` mode it runs from the bottom face's handle to
    // the top one's, and a handle is the smaller, more deliberate target.
    return shaftUnderPointer(event) ? "shaft" : null;
  }

  /** Whether the pointer is within SHAFT_HIT_PX of the guide on screen. */
  function shaftUnderPointer(event: PointerEvent): boolean {
    const rect = deps.renderer.domElement.getBoundingClientRect();
    const { x, z, min, max } = shaftFrame;
    const a = new THREE.Vector3(x, min.y, z)
      .applyMatrix4(group.matrix)
      .project(deps.camera);
    const b = new THREE.Vector3(x, max.y, z)
      .applyMatrix4(group.matrix)
      .project(deps.camera);
    if (a.z > 1 || b.z > 1) return false;
    const ax = (a.x * 0.5 + 0.5) * rect.width;
    const ay = (-a.y * 0.5 + 0.5) * rect.height;
    const dx = (b.x * 0.5 + 0.5) * rect.width - ax;
    const dy = (-b.y * 0.5 + 0.5) * rect.height - ay;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= SHAFT_HIT_PX;
  }

  /**
   * The pointer ray in the model's local space.
   *
   * Doing the drag maths locally rather than in world space means the model's
   * rotation never enters it: the axis a face slides along is a cardinal axis
   * by construction, so there is nothing to transform and nothing to get wrong
   * when the scan is turned.
   */
  function localPointerRay(event: PointerEvent): THREE.Ray | null {
    const model = deps.getModel();
    if (!model) return null;
    setPointer(event);
    inverseModel.copy(model.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverseModel);
    return localRay;
  }

  /** How far along the drag axis the pointer currently sits. */
  function pointerAlongAxis(
    event: PointerEvent,
    grip: Face | "pov",
  ): number | null {
    const ray = localPointerRay(event);
    if (!ray) return null;
    const point = ray.intersectPlane(dragPlane, scratch);
    if (!point) return null;
    return point[gripAxis(grip)];
  }

  /**
   * The ring nearest the pointer on screen, if it is within RING_HIT_PX.
   *
   * Tested in screen space rather than by raycasting, because a ring is a
   * line: at a grazing angle its plane is useless to intersect, and a ray
   * almost never meets a line exactly. Projecting its points and measuring the
   * pointer's distance to each segment works the same from any angle.
   */
  function ringUnderPointer(event: PointerEvent): RotateAxis | null {
    const rect = deps.renderer.domElement.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const toScreen = (v: THREE.Vector3) => {
      v.applyMatrix4(group.matrix).project(deps.camera);
      return {
        x: (v.x * 0.5 + 0.5) * rect.width,
        y: (-v.y * 0.5 + 0.5) * rect.height,
        behind: v.z > 1,
      };
    };

    let best: RotateAxis | null = null;
    let bestDistance = RING_HIT_PX;
    const point = new THREE.Vector3();
    for (const axis of ["x", "y", "z"] as const) {
      let previous = toScreen(ringPoint(axis, 0, point));
      for (let i = 1; i <= RING_SEGMENTS; i++) {
        const next = toScreen(
          ringPoint(axis, (i / RING_SEGMENTS) * Math.PI * 2, point),
        );
        if (!previous.behind && !next.behind) {
          const dx = next.x - previous.x;
          const dy = next.y - previous.y;
          const lengthSq = dx * dx + dy * dy || 1;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((px - previous.x) * dx + (py - previous.y) * dy) / lengthSq,
            ),
          );
          const distance = Math.hypot(
            px - (previous.x + t * dx),
            py - (previous.y + t * dy),
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            best = axis;
          }
        }
        previous = next;
      }
    }
    return best;
  }

  /** The pointer's angle about a point on the canvas, counter-clockwise. */
  function pointerAngle(event: PointerEvent, cx: number, cy: number): number {
    const rect = deps.renderer.domElement.getBoundingClientRect();
    return Math.atan2(
      -(event.clientY - rect.top - cy),
      event.clientX - rect.left - cx,
    );
  }

  /**
   * Starts turning the scan about `axis`.
   *
   * Two ways of reading the drag, chosen by how squarely the ring faces the
   * camera. Intersecting the pointer with the ring's own plane, the obvious
   * approach, falls apart as the ring turns edge-on: the pointer ray grazes the
   * plane, the hit runs off to the horizon or behind the camera, and a drag
   * along a ring that is plainly visible does almost nothing.
   *
   * - A ring facing the camera is turned by circling the pointer round its
   *   centre on screen, which is exactly what the ring looks like it wants.
   * - Any other ring is turned by dragging its near side, the part facing the
   *   camera. The pointer is followed across a plane through the centre facing
   *   the camera, and its travel along the direction that near side moves is
   *   converted to an angle by the ring's radius, so the near side keeps pace
   *   with the pointer. That direction is eye × axis, which only vanishes when
   *   the ring faces the camera, the case the first method takes.
   */
  function beginRotate(axis: RotateAxis, event: PointerEvent): boolean {
    const model = deps.getModel();
    const ray = localPointerRay(event);
    if (!model || !ray) return false;

    const axisVector = AXIS_VECTORS[axis];
    inverseModel.copy(model.matrixWorld).invert();
    deps.camera.getWorldDirection(localViewDir);
    localViewDir.transformDirection(inverseModel);
    const facing = localViewDir.dot(axisVector);

    if (Math.abs(facing) >= FACE_ON_FACING) {
      const rect = deps.renderer.domElement.getBoundingClientRect();
      const centre = ringCentre
        .clone()
        .applyMatrix4(group.matrix)
        .project(deps.camera);
      const centreX = (centre.x * 0.5 + 0.5) * rect.width;
      const centreY = (-centre.y * 0.5 + 0.5) * rect.height;
      rotating = {
        axis,
        method: "circle",
        centreX,
        centreY,
        // Counter-clockwise on screen is a positive turn when the axis points
        // back at the viewer, and a negative one when it points away.
        sign: facing < 0 ? 1 : -1,
        previous: pointerAngle(event, centreX, centreY),
        total: 0,
      };
    } else {
      rotatePlane.setFromNormalAndCoplanarPoint(
        localViewDir.clone().negate(),
        ringCentre,
      );
      const origin = ray.intersectPlane(rotatePlane, new THREE.Vector3());
      if (!origin) return false;
      rotating = {
        axis,
        method: "tangent",
        origin,
        tangent: localViewDir.clone().cross(axisVector).normalize(),
        total: 0,
      };
    }

    setRingHighlight(axis);
    deps.renderer.domElement.style.cursor = "grabbing";
    deps.controls.enabled = false;
    return true;
  }

  function moveRotate(event: PointerEvent) {
    if (!rotating) return;

    if (rotating.method === "circle") {
      const angle = pointerAngle(event, rotating.centreX, rotating.centreY);
      // Unwrapped, so circling past half a turn keeps counting instead of
      // flipping sign at the seam of atan2.
      let delta = angle - rotating.previous;
      if (delta > Math.PI) delta -= Math.PI * 2;
      else if (delta < -Math.PI) delta += Math.PI * 2;
      rotating.total += rotating.sign * delta;
      rotating.previous = angle;
    } else {
      const ray = localPointerRay(event);
      const hit = ray?.intersectPlane(rotatePlane, new THREE.Vector3());
      if (!hit) return;
      rotating.total =
        hit.sub(rotating.origin).dot(rotating.tangent) / ringRadius;
    }

    const turns = Math.round(rotating.total / SNAP_STEP);
    const snapped =
      turns !== 0 && Math.abs(rotating.total - turns * SNAP_STEP) < SNAP_WITHIN
        ? turns * SNAP_STEP
        : rotating.total;
    deps.onRotate(rotating.axis, snapped);
  }

  function endRotate() {
    if (!rotating) return;
    rotating = null;
    setRingHighlight(hoveredRing);
    deps.renderer.domElement.style.cursor = hoveredRing ? "grab" : "";
    deps.controls.enabled = !hoveredRing;
    deps.onRotateEnd();
  }

  /**
   * Starts moving the POV guide across the floor.
   *
   * Across a horizontal plane at the height it was grabbed, so the guide stays
   * under the pointer from above. Seen from nearly level that plane is grazed
   * by the pointer ray (see SHAFT_LEVEL_VIEW), so there it is a vertical plane
   * facing the camera instead, and only the horizontal part of the travel is
   * used: the guide follows the pointer sideways, and depth is set by orbiting
   * round to look from another side, or from above.
   */
  function beginShaftDrag(event: PointerEvent): boolean {
    const model = deps.getModel();
    const ray = localPointerRay(event);
    if (!model || !ray) return false;

    const { x, z, min, max } = shaftFrame;
    const grabbed = new THREE.Vector3();
    ray.distanceSqToSegment(
      scratch.set(x, min.y, z),
      new THREE.Vector3(x, max.y, z),
      undefined,
      grabbed,
    );

    inverseModel.copy(model.matrixWorld).invert();
    deps.camera.getWorldDirection(localViewDir);
    localViewDir.transformDirection(inverseModel);
    if (Math.abs(localViewDir.y) >= SHAFT_LEVEL_VIEW) {
      dragPlane.setFromNormalAndCoplanarPoint(AXIS_VECTORS.y, grabbed);
    } else {
      localViewDir.y = 0;
      if (localViewDir.lengthSq() < 1e-8) return false;
      dragPlane.setFromNormalAndCoplanarPoint(
        localViewDir.normalize().negate(),
        grabbed,
      );
    }

    if (!ray.intersectPlane(dragPlane, shaftDragStart)) return false;
    shaftStartX = x;
    shaftStartZ = z;
    dragging = "shaft";
    setGripHighlight("shaft");
    deps.renderer.domElement.style.cursor = "grabbing";
    deps.controls.enabled = false;
    return true;
  }

  function moveShaft(event: PointerEvent) {
    const ray = localPointerRay(event);
    const hit = ray?.intersectPlane(dragPlane, scratch);
    if (!hit) return;
    const { min, max } = shaftFrame;
    shaftFrame.x = clampInsideEdges(
      shaftStartX + hit.x - shaftDragStart.x,
      min.x,
      max.x,
    );
    shaftFrame.z = clampInsideEdges(
      shaftStartZ + hit.z - shaftDragStart.z,
      min.z,
      max.z,
    );
    writeShaft();
    deps.onShaftMove(shaftFrame.x, shaftFrame.z);
  }

  function beginDrag(grip: Grip, event: PointerEvent): boolean {
    if (grip === "shaft") return beginShaftDrag(event);
    const model = deps.getModel();
    if (!model) return false;

    localAxis.set(0, 0, 0);
    localAxis[gripAxis(grip)] = 1;

    // The drag plane contains the axis and faces the camera as squarely as it
    // can: the component of the view direction perpendicular to the axis. A
    // plane chosen any other way collapses to an edge as the camera comes
    // round to look along it, and the projected pointer position runs away.
    inverseModel.copy(model.matrixWorld).invert();
    deps.camera.getWorldDirection(localViewDir);
    localViewDir.transformDirection(inverseModel);
    localViewDir.addScaledVector(localAxis, -localViewDir.dot(localAxis));

    // Degenerate only when the camera looks exactly along the axis, where no
    // plane through it faces the viewer at all and any drag would be noise.
    if (localViewDir.lengthSq() < 1e-8) return false;
    localViewDir.normalize().negate();

    const centre = gripCentre(grip, new THREE.Vector3());
    dragPlane.setFromNormalAndCoplanarPoint(localViewDir, centre);

    const along = pointerAlongAxis(event, grip);
    if (along == null) return false;

    dragging = grip;
    dragStartAlongAxis = along;
    dragStartValue = gripValue(grip);
    setGripHighlight(grip);
    if (grip !== "pov") emphasiseWall(grip);
    deps.renderer.domElement.style.cursor = "grabbing";
    // OrbitControls is disabled for the whole gesture rather than being asked
    // to ignore it, because it has already seen this pointerdown: its listener
    // is attached to the same canvas in init() and runs first.
    deps.controls.enabled = false;
    return true;
  }

  function moveDrag(event: PointerEvent) {
    if (!dragging) return;
    if (dragging === "shaft") {
      moveShaft(event);
      return;
    }
    const along = pointerAlongAxis(event, dragging);
    if (along == null) return;

    const next = dragStartValue + (along - dragStartAlongAxis);

    if (dragging === "pov") {
      povY = clampPov(next);
      writeShaft();
      deps.onPovChange(povY);
      return;
    }

    const { axis, end } = dragging;

    // Clamped against the opposite face and against the scan's own bounds: the
    // box may shrink and be pushed back out, but never grow past geometry that
    // exists, and never collapse to a degenerate axis (see MIN_CROP_SIZE).
    if (end === "min") {
      box.min[axis] = Math.min(
        Math.max(next, bounds.min[axis]),
        box.max[axis] - MIN_CROP_SIZE,
      );
    } else {
      box.max[axis] = Math.max(
        Math.min(next, bounds.max[axis]),
        box.min[axis] + MIN_CROP_SIZE,
      );
    }

    redraw();
    deps.onChange(box);
  }

  function endDrag() {
    if (!dragging) return;
    const wasFace = dragging !== "pov" && dragging !== "shaft";
    dragging = null;
    emphasiseWall(null);
    setGripHighlight(hovered);
    if (wasFace) deps.onDragEnd();
    deps.renderer.domElement.style.cursor = hovered ? "grab" : "";
    deps.controls.enabled = !hovered;
  }

  /* --- Public surface ------------------------------------------------------ */

  return {
    /** Opens the gizmo on `initial`, clamped within the scan's own `limits`. */
    show(initial: THREE.Box3, limits: THREE.Box3) {
      bounds.copy(limits);
      box.copy(initial);
      hovered = null;
      dragging = null;
      tool = "box";
      applyToolVisibility();
      setGripHighlight(null);
      emphasiseWall(null);
      redraw();
      group.visible = true;
    },

    hide() {
      endDrag();
      endRotate();
      hovered = null;
      hoveredRing = null;
      setGripHighlight(null);
      group.visible = false;
      deps.renderer.domElement.style.cursor = "";
      deps.controls.enabled = true;
    },

    get visible() {
      return group.visible;
    },

    /**
     * Switches between resizing the box and turning the scan.
     *
     * For rotate, `centre` is the pivot the scan turns about, `size` the scan's
     * largest dimension, which sizes the rings, and `floorY` where the level
     * grid lies. All in local space.
     */
    setTool(
      next: CropGizmoTool,
      rotate?: { centre: THREE.Vector3; size: number; floorY: number },
    ) {
      endDrag();
      endRotate();
      hovered = null;
      hoveredRing = null;
      setGripHighlight(null);
      setRingHighlight(null);
      deps.renderer.domElement.style.cursor = "";
      deps.controls.enabled = true;
      tool = next;
      if (next === "rotate" && rotate) {
        ringCentre.copy(rotate.centre);
        ringRadius = Math.max(rotate.size * RING_RADIUS_FACTOR, MIN_CROP_SIZE);
        writeRings();
        writeGrid(rotate.floorY);
      }
      applyToolVisibility();
    },

    /** Moves the level grid to height `y`, in local space, while rotating. */
    setGridFloor(y: number) {
      if (tool === "rotate") writeGrid(y);
    },

    /** A copy, so callers cannot mutate the box the gizmo is drawing. */
    getBox(): THREE.Box3 {
      return box.clone();
    },

    setBox(next: THREE.Box3) {
      box.copy(next);
      redraw();
      deps.onChange(box);
    },

    /**
     * Stands the POV guide in `frame` at `x`, `z` and puts the eye at `y`, all
     * clamped inside it. Returns where the eye ended up.
     *
     * Driven by the caller rather than derived here, because the frame is not
     * always the drawn box: in `remove` mode it is whatever geometry survives,
     * which only the scene can measure.
     */
    setShaft(frame: THREE.Box3, eye: THREE.Vector3): THREE.Vector3 {
      shaftFrame.min.copy(frame.min);
      shaftFrame.max.copy(frame.max);
      shaftFrame.x = clampInsideEdges(eye.x, frame.min.x, frame.max.x);
      shaftFrame.z = clampInsideEdges(eye.z, frame.min.z, frame.max.z);
      povY = clampPov(eye.y);
      writeShaft();
      return new THREE.Vector3(shaftFrame.x, povY, shaftFrame.z);
    },

    /**
     * Whether the gizmo took this pointerdown.
     *
     * True means the caller must not treat it as an orbit, a POV drag or an
     * annotation placement.
     */
    onPointerDown(event: PointerEvent): boolean {
      if (!group.visible) return false;
      if (tool === "rotate") {
        const axis = ringUnderPointer(event);
        return axis ? beginRotate(axis, event) : false;
      }
      const grip = gripUnderPointer(event);
      if (!grip) return false;
      return beginDrag(grip, event);
    },

    onPointerMove(event: PointerEvent): boolean {
      if (!group.visible) return false;
      if (tool === "rotate") {
        if (rotating) {
          moveRotate(event);
          return true;
        }
        const axis = ringUnderPointer(event);
        if (axis !== hoveredRing) {
          hoveredRing = axis;
          setRingHighlight(axis);
          deps.renderer.domElement.style.cursor = axis ? "grab" : "";
        }
        deps.controls.enabled = !axis;
        return Boolean(axis);
      }
      if (dragging) {
        moveDrag(event);
        return true;
      }
      // Hover does double duty: it highlights the handle, and it takes
      // OrbitControls out of the way before the press, so dragging a handle
      // never also spins the camera. Dragging anywhere else still orbits.
      const grip = gripUnderPointer(event);
      if (grip !== hovered) {
        hovered = grip;
        setGripHighlight(grip);
        deps.renderer.domElement.style.cursor = grip ? "grab" : "";
      }
      deps.controls.enabled = !grip;
      return Boolean(grip);
    },

    onPointerUp(): boolean {
      const wasDragging = Boolean(dragging) || Boolean(rotating);
      endDrag();
      endRotate();
      return wasDragging;
    },

    /** Per frame: track the model, and hold the handles and lines at size. */
    update() {
      if (!group.visible) return;
      const model = deps.getModel();
      if (!model) return;

      group.matrix.copy(model.matrixWorld);
      group.matrixWorldNeedsUpdate = true;

      const width = deps.renderer.domElement.clientWidth || 1;
      const height = deps.renderer.domElement.clientHeight || 1;

      // A sprite without size attenuation spans `scale * f / 2` of the
      // viewport's height, where f is 1 / tan(fov / 2). Inverting that gives
      // the scale for a handle HANDLE_HIT_PX tall. Recomputed per frame because
      // both the field of view and the viewer's size can change under it.
      const tan = Math.tan((deps.camera.fov * Math.PI) / 360);
      const scale = (HANDLE_HIT_PX * 2 * tan) / height;
      for (const face of faces) face.handle.scale.setScalar(scale);
      povDot.scale.setScalar((POV_HIT_PX * 2 * tan) / height);

      // Line widths are in pixels of whatever resolution the material is told,
      // so it follows the canvas's CSS size to keep them in CSS pixels.
      edges.material.resolution.set(width, height);
      brackets.material.resolution.set(width, height);
      shaft.material.resolution.set(width, height);
      for (const ring of Object.values(rings))
        ring.material.resolution.set(width, height);
      grid.material.resolution.set(width, height);
    },

    dispose() {
      deps.scene.remove(group);
      edges.geometry.dispose();
      edges.material.dispose();
      brackets.geometry.dispose();
      brackets.material.dispose();
      wallGeometry.dispose();
      for (const face of faces) face.wall.material.dispose();
      handleTexture.dispose();
      for (const face of faces) face.handle.material.dispose();
      shaft.geometry.dispose();
      shaft.material.dispose();
      povTexture.dispose();
      povDot.material.dispose();
      for (const ring of Object.values(rings)) {
        ring.geometry.dispose();
        ring.material.dispose();
      }
      grid.geometry.dispose();
      grid.material.dispose();
    },
  };
}

export type CropGizmo = ReturnType<typeof createCropGizmo>;
