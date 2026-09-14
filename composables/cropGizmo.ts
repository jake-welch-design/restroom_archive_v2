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
 * How close the POV dot may get to the frame's floor or ceiling, in model units.
 * An eye flush with the floor would be looking out through it.
 */
export const POV_EDGE_MARGIN = 0.05;

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

/** Anything the pointer can pick up: one of the six faces, or the POV dot. */
type Grip = Face | "pov";

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
  /**
   * Called once when a face drag is released.
   *
   * For work too heavy to redo on every drag frame: in `remove` mode the POV
   * guide's position depends on what geometry survives, which means walking
   * the scan's vertices.
   */
  onDragEnd: () => void;
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

  // The guide the POV eye slides along: a vertical line through the centre of
  // the box the viewer will frame on, from its floor to its ceiling. POV stands
  // at that centre, so this is where the camera actually is, and only its
  // height is the admin's to choose.
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

  /* --- State -------------------------------------------------------------- */

  let hovered: Grip | null = null;
  let dragging: Grip | null = null;

  /** The POV guide: where it stands, how far it runs, and where the eye is. */
  const shaftFrame = { x: 0, z: 0, minY: 0, maxY: 0 };
  let povY = 0;
  const shaftValues = new Float32Array(6);

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
    const low = shaftFrame.minY + POV_EDGE_MARGIN;
    const high = shaftFrame.maxY - POV_EDGE_MARGIN;
    // A frame shorter than two margins has no room either side; sit in it.
    if (low > high) return (shaftFrame.minY + shaftFrame.maxY) / 2;
    return Math.min(Math.max(y, low), high);
  }

  function writeShaft() {
    const { x, z, minY, maxY } = shaftFrame;
    shaftValues.set([x, minY, z, x, maxY, z]);
    writeSegments(shaft, shaftValues);
    povDot.position.set(x, povY, z);
  }

  function setGripHighlight(grip: Grip | null) {
    for (const f of faces)
      f.handle.material.color.setHex(f === grip ? ACCENT : WHITE);
    povDot.material.color.setHex(grip === "pov" ? ACCENT : WHITE);
  }

  function gripAxis(grip: Grip): Axis {
    return grip === "pov" ? "y" : grip.axis;
  }

  function gripValue(grip: Grip): number {
    return grip === "pov" ? povY : faceValue(grip);
  }

  function gripCentre(grip: Grip, out: THREE.Vector3): THREE.Vector3 {
    return grip === "pov"
      ? out.set(shaftFrame.x, povY, shaftFrame.z)
      : faceCentre(grip, out);
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
    if (!hit) return null;
    return faces.find((f) => f.handle === hit.object) ?? null;
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
  function pointerAlongAxis(event: PointerEvent, grip: Grip): number | null {
    const ray = localPointerRay(event);
    if (!ray) return null;
    const point = ray.intersectPlane(dragPlane, scratch);
    if (!point) return null;
    return point[gripAxis(grip)];
  }

  function beginDrag(grip: Grip, event: PointerEvent): boolean {
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
    const wasFace = dragging !== "pov";
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
      setGripHighlight(null);
      emphasiseWall(null);
      redraw();
      group.visible = true;
    },

    hide() {
      endDrag();
      hovered = null;
      setGripHighlight(null);
      group.visible = false;
      deps.renderer.domElement.style.cursor = "";
      deps.controls.enabled = true;
    },

    get visible() {
      return group.visible;
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
     * Stands the POV guide in `frame` and puts the eye at `y`, clamped inside
     * it. Returns where the eye ended up.
     *
     * Driven by the caller rather than derived here, because the frame is not
     * always the drawn box: in `remove` mode it is whatever geometry survives,
     * which only the scene can measure.
     */
    setShaft(frame: THREE.Box3, y: number): number {
      const centre = frame.getCenter(new THREE.Vector3());
      shaftFrame.x = centre.x;
      shaftFrame.z = centre.z;
      shaftFrame.minY = frame.min.y;
      shaftFrame.maxY = frame.max.y;
      povY = clampPov(y);
      writeShaft();
      return povY;
    },

    /**
     * Whether the gizmo took this pointerdown.
     *
     * True means the caller must not treat it as an orbit, a POV drag or an
     * annotation placement.
     */
    onPointerDown(event: PointerEvent): boolean {
      if (!group.visible) return false;
      const grip = gripUnderPointer(event);
      if (!grip) return false;
      return beginDrag(grip, event);
    },

    onPointerMove(event: PointerEvent): boolean {
      if (!group.visible) return false;
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
      const wasDragging = Boolean(dragging);
      endDrag();
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
    },
  };
}

export type CropGizmo = ReturnType<typeof createCropGizmo>;
