import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Ref } from "vue";
import type { CameraMode } from "~/types/annotation";
import type { Crop, CropBox, CropMode } from "~~/shared/utils/crop";
import { isLevelled, type Level, type Vec3 } from "~~/shared/utils/levelling";
import {
  clampInsideEdges,
  createCropGizmo,
  type CropGizmo,
  type CropGizmoTool,
  type RotateAxis,
} from "~/composables/cropGizmo";

export type ViewMode = "orbit" | "pov";

/** What a finished crop edit hands back for saving. */
export interface CropResult {
  /** The new crop, or null when it was cleared back to the scan's own bounds. */
  crop: Crop | null;
  /**
   * The centre the viewer framed on before and after, each in its own levelled
   * space. The server needs both to move annotations through a change of
   * rotation as well as of centre; see shared/utils/levelling.ts.
   */
  centreBefore: Vec3;
  centreAfter: Vec3;
}

export interface CameraSnapshot {
  cameraMode: CameraMode;
  cameraFov: number;
  modelRotationY: number;
  orbitPosX?: number;
  orbitPosY?: number;
  orbitPosZ?: number;
  orbitTargetX?: number;
  orbitTargetY?: number;
  orbitTargetZ?: number;
  rotationX?: number;
  rotationY?: number;
}

/**
 * Timing and scene-census logging for one model load.
 *
 * Returns null outside a development build. Callers reach it through optional
 * chaining, so `import.meta.dev` being statically false lets the bundler drop
 * both this factory and every call site. That matters more than usual here:
 * `census` walks the entire scene graph and every material key on it purely to
 * produce a log line, which on a photogrammetry scan is real work.
 *
 * `phase` reports the time since the previous phase (or since the load began)
 * and then resets the marker, so phases read as a contiguous timeline.
 */
/* eslint-disable no-console -- Logging is this factory's entire purpose, and
   the early return above means none of it is reachable in a production build. */
function createLoadProfiler(url: string) {
  if (!import.meta.dev) return null;

  const tag = `[viewer] load ${url.split("/").pop()}`;
  const started = performance.now();
  let phaseStart = started;
  const elapsed = (from: number) =>
    `${(performance.now() - from).toFixed(0)}ms`;

  return {
    phase(label: string) {
      console.log(`${tag} ${label}: ${elapsed(phaseStart)}`);
      phaseStart = performance.now();
    },

    total() {
      console.log(`${tag} TOTAL: ${elapsed(started)}`);
    },

    census(model: THREE.Object3D, renderer: THREE.WebGLRenderer | null) {
      let meshCount = 0;
      let triangles = 0;
      let vertices = 0;
      const textures = new Set<THREE.Texture>();

      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        meshCount++;

        const index = mesh.geometry.index;
        const position = mesh.geometry.attributes.position;
        if (index) triangles += index.count / 3;
        else if (position) triangles += position.count / 3;
        if (position) vertices += position.count;

        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) {
          if (!material) continue;
          for (const value of Object.values(material)) {
            if (value && typeof value === "object" && value.isTexture) {
              textures.add(value as THREE.Texture);
            }
          }
        }
      });

      console.log(
        `${tag} stats: ${meshCount} meshes · ` +
          `${Math.round(triangles).toLocaleString()} tris · ` +
          `${vertices.toLocaleString()} verts · ${textures.size} textures`,
      );

      if (renderer) {
        // Cloned through JSON so the console snapshots the counts at this
        // instant rather than live-updating them as frames render.
        console.log(
          `${tag} renderer.info before frame:`,
          JSON.parse(JSON.stringify(renderer.info)),
        );
      }
    },
  };
}
/* eslint-enable no-console */

/**
 * The shared Draco decoder, created once and reused by every model load.
 *
 * Scans submitted with Draco compression carry `KHR_draco_mesh_compression`,
 * and `GLTFLoader` refuses to read one without a decoder attached -- the
 * failure is the flat "No DRACOLoader instance provided." with no model. An
 * uncompressed scan never touches this, so attaching it costs nothing for the
 * archive's existing entries; the decoder itself is only fetched the first time
 * a compressed one is actually opened.
 *
 * Shared rather than per-load because `DRACOLoader` spins up a Web Worker and
 * caches the compiled decoder on the instance. `loadModel` builds a fresh
 * `GLTFLoader` for every model, so a decoder built alongside it would start a
 * new worker per scan viewed and leave the old ones running.
 *
 * Built lazily rather than at module scope: this module is imported during SSR
 * even though the scene itself is client-only, and construction should not
 * happen on the server.
 */
let dracoLoader: DRACOLoader | null = null;

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    // Served from public/draco/ -- same-origin, so it satisfies
    // `connect-src 'self'` without a CSP exception. See public/draco/README.md.
    dracoLoader.setDecoderPath("/draco/");
  }
  return dracoLoader;
}

export function useThreeScene(
  canvasRef: Ref<HTMLCanvasElement | null>,
  modelUrl: Ref<string | null | undefined>,
  storedCrop: Ref<Crop | null | undefined>,
  onPickPoint?: (point: THREE.Vector3, snapshot: CameraSnapshot) => void,
) {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const mode = ref<ViewMode>("orbit");
  const createMode = ref(false);
  const markersVisible = ref(true);
  /** Whether the admin crop tool is open. */
  const cropEditing = ref(false);
  /**
   * Which side of the box survives while editing.
   *
   * Separate from `cropEditing`, which is only whether the tool is open. Held
   * as its own ref so the panel's toggle reads it directly.
   */
  const cropMode = ref<CropMode>("keep");
  /**
   * The box the gizmo is currently drawing, mirrored out as plain numbers.
   *
   * The gizmo itself is imperative, so this is what lets the panel react to a
   * drag, which it needs in order to count the annotations that would fall
   * outside the box as the admin moves a face.
   */
  const cropDraft = ref<CropBox | null>(null);
  /**
   * Whether the box as drawn would erase the whole scan, which only happens in
   * `remove` mode. A cheap box test rather than a vertex count, so it can run on
   * every drag frame; the exact check happens once at save.
   */
  const cropEmptiesScan = ref(false);
  /**
   * Whether the crop tool's scene is set up: box shown, clipping on, camera
   * framed. Lags `cropEditing` by `sceneDelayMs` when startCrop is given one.
   *
   * Until it is true there is no box to toggle, reset or save, so those all
   * decline rather than act on whatever the gizmo held last time.
   */
  const cropReady = ref(false);
  /** Whether the crop tool is resizing the box or turning the scan. */
  const cropTool = ref<CropGizmoTool>("box");
  /** The angle of a ring drag in progress, in degrees, for the note. */
  const rotateDegrees = ref<number | null>(null);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  /**
   * The model as the viewer handles it: the group it positions and turns.
   *
   * A wrapper around the GLB's own scene rather than that scene itself, with
   * `levelNode` between the two. The wrapper's local space is the levelled
   * space every crop box, eye height and annotation point is stored in; the
   * level node is the rotation that turns the scan as exported into it. For a
   * scan that has never been levelled that node is the identity and the two
   * spaces are the same, which is why nothing stored before it existed moves.
   */
  let currentModel: THREE.Group | null = null;
  let levelNode: THREE.Group | null = null;
  let raf = 0;

  let userInteracted = false;
  let orbitDistance = 4;
  let loadId = 0;

  /* --- Crop ---------------------------------------------------------------
   * Three boxes, all in the model's own local space, all distinct:
   *
   * - `originalBounds` is what the scan measures, captured once at load. It is
   *   the ceiling on any crop and what Reset goes back to. It cannot be
   *   re-measured later, because `setFromObject` reports world space and the
   *   model has been moved by then.
   * - `appliedBox` is what the viewer is framed and centred on right now.
   * - `clipBox` is what the clipping planes are cutting to, which during a drag
   *   is the draft rather than the applied box.
   */
  const originalBounds = new THREE.Box3();
  const appliedBox = new THREE.Box3();
  const appliedCentre = new THREE.Vector3();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const clipBox = new THREE.Box3();
  let clipMode: CropMode = "keep";
  let clippingActive = false;
  /**
   * The crop actually in force, or null for none.
   *
   * Distinct from `clipBox` and `cropMode`, which follow the draft during an
   * edit. This is what Cancel restores to, and it is tracked here rather than
   * re-read from `storedCrop` so that a second edit in the same session starts
   * from the crop just saved rather than from whatever the props have got
   * round to.
   */
  let committedCrop: Crop | null = null;

  /** The camera as it was when the crop tool opened, for Cancel to restore. */
  let viewBeforeCrop: {
    mode: ViewMode;
    fov: number;
    position: THREE.Vector3;
    target: THREE.Vector3;
    rotationX: number;
    rotationY: number;
  } | null = null;

  /** Breathing room around the box when the crop tool frames it. */
  const CROP_FRAME_MARGIN = 1.08;

  /**
   * How far above the frame's centre POV stands when no height has been set.
   *
   * This is the height POV always used, kept as the default so every scan and
   * every crop saved before the eye could be moved looks exactly as it did.
   */
  const DEFAULT_POV_RISE = 0.2;

  /**
   * The POV eye height being edited, in model-local Y, or null while it is
   * still at the default.
   *
   * Null is a real state rather than "unset": a default eye follows the frame's
   * centre as the box is resized, and only once the admin drags it does it
   * become a fixed height that stays put.
   */
  let draftPovY: number | null = null;
  /**
   * Where the POV eye stands, in model-local X and Z, or null while it is still
   * at the frame's centre. Null follows the centre for the same reason as
   * `draftPovY`.
   */
  let draftPovXZ: { x: number; z: number } | null = null;

  /**
   * The box as it was before switching to `remove` shrank it, while that shrunk
   * box is still untouched. Null once a face has been dragged, or when no
   * shrink happened.
   *
   * Switching back to `keep` restores it. Without that, flipping the mode to
   * `remove` and back leaves a quarter-size `keep` box behind, which trims
   * away most of the scan, and with the crop button saving on its next press
   * one idle round trip of the toggle would be enough to save it.
   */
  let boxBeforeShrink: THREE.Box3 | null = null;

  /**
   * The levelling rotation being edited, and the point it turns about.
   *
   * Applied to the level node live, so the scan turns as a ring is dragged. The
   * pivot is the stored one for a scan already levelled, or the centre of the
   * scan as exported for one being levelled for the first time.
   */
  const draftRotation = new THREE.Quaternion();
  const draftPivot = new THREE.Vector3();
  /** The rotation when the current ring drag, and the current rotate session, began. */
  const rotationAtDragStart = new THREE.Quaternion();
  const rotationAtToolStart = new THREE.Quaternion();
  /**
   * The rotation actually in force, mirrored as a quaternion so drawing each
   * annotation marker every frame does not rebuild one from the stored crop.
   */
  const committedRotation = new THREE.Quaternion();
  const relativeRotation = new THREE.Quaternion();
  const IDENTITY = new THREE.Quaternion();
  /** Two rotations closer than this, a hundredth of a degree, are the same. */
  const ROTATION_EPSILON = (0.01 * Math.PI) / 180;
  const AXES: Record<RotateAxis, THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };

  /**
   * Identifies the most recent startCrop, so a delayed scene setup can tell
   * whether it has been overtaken by a cancel or another open before it runs.
   */
  let cropStartToken = 0;

  /** The frame the current draft would save with, which the POV guide stands in. */
  const draftFrame = new THREE.Box3();

  /**
   * Where POV puts the camera, in world space.
   *
   * Every POV placement goes through here: entering POV, re-framing while in
   * it, and flying to a POV annotation. World space is Ry(θ) · (L − C) (see
   * pinCentre), so a stored local eye converts by subtracting the centre and
   * turning by the model's turn, `theta`. Model rotation is about Y only, which
   * is why the height needs the subtraction and nothing else.
   */
  function povPosition(
    out = new THREE.Vector3(),
    theta = currentModel?.rotation.y ?? 0,
  ): THREE.Vector3 {
    const { povX, povY, povZ } = committedCrop ?? {};
    out.set(0, povY == null ? DEFAULT_POV_RISE : povY - appliedCentre.y, 0);
    if (povX != null && povZ != null) {
      out.x = povX - appliedCentre.x;
      out.z = povZ - appliedCentre.z;
    }
    return out.applyAxisAngle(Y_AXIS, theta);
  }

  let gizmo: CropGizmo | null = null;

  // Six planes held in local space, and the world-space array the materials
  // actually read, refreshed from the model's matrix every frame. Two arrays
  // rather than one because clipping planes are world-space while the crop is
  // defined against the geometry, and the model rotates.
  const cropLocalPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
  const cropWorldPlanes = Array.from({ length: 6 }, () => new THREE.Plane());

  // Orbit pivot re-anchoring (see reanchorOrbitTarget)
  let modelRadius = 2;
  let lastProbeAt = 0;
  const probeRaycaster = new THREE.Raycaster();
  const probeDir = new THREE.Vector3();
  // Raycasting a photogrammetry mesh is O(triangles) and there is no BVH here, so
  // the probe only runs on interaction start and never more than this often.
  const PROBE_INTERVAL_MS = 250;
  // How much farther the geometry has to be than the pivot before correcting.
  // Kept high so ordinary orbiting from outside the model keeps its centre pivot.
  const PROBE_RATIO = 2.5;

  // Tween state for flyTo
  let tweenRaf = 0;
  let tweenActive = false;

  const povState = {
    rotationX: 0,
    rotationY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    fov: 80,
  };

  // POV is a first-person look-around: yaw, then pitch, never any roll. Orbit
  // leaves the camera on a lookAt orientation whose Euler carries a non-zero z,
  // so writing only x and y on the way into POV keeps that roll and tilts the
  // horizon until setMode resets the whole Euler. Every POV orientation write
  // goes through here instead, which rewrites all three angles and pins z to 0.
  function applyPovRotation() {
    if (!camera) return;
    povState.rotationX = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, povState.rotationX),
    );
    camera.rotation.set(povState.rotationX, povState.rotationY, 0, "YXZ");
  }

  // Track pointer movement to distinguish click from drag
  let pointerDownX = 0;
  let pointerDownY = 0;

  // Multi-touch pinch tracking
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartFov = 0;

  function getPinchDist() {
    const pts = [...activePointers.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function init(canvas: HTMLCanvasElement) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000);
    // Photogrammetry scans have lighting baked into their base color texture, so
    // the viewer renders unlit (see toUnlitMaterial). No tone mapping either:
    // it would remap those baked values and wash the scan out.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Per-material rather than the renderer-wide `clippingPlanes`, so the crop
    // cuts the scan without also cutting the gizmo drawing the box.
    renderer.localClippingEnabled = true;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, 1, 0.01, 1000);
    // Yaw-then-pitch order, matching how POV drives the camera. Fixed once here
    // so orbit's lookAt() decomposes into the same convention and POV never has
    // to reinterpret an XYZ Euler as YXZ.
    camera.rotation.order = "YXZ";
    camera.position.set(0, 0, 4);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    controls.addEventListener("start", () => {
      userInteracted = true;
    });

    gizmo = createCropGizmo({
      scene,
      camera,
      renderer,
      controls,
      getModel: () => currentModel,
      onChange: (box) => {
        // Clip to the draft as the face moves, but leave the model where it is.
        // Re-centring on every drag frame would slide the scan out from under
        // the handle being dragged.
        setClipBox(box, cropMode.value);
        cropDraft.value = cropFromBox(box);
        cropEmptiesScan.value = wouldEmptyScan(box, cropMode.value);
        // In `keep` mode the frame is the box, so the guide can follow every
        // drag frame for free. In `remove` mode finding it means walking the
        // scan's vertices, which waits for the drag to end (see onDragEnd).
        if (cropMode.value === "keep") syncPovGuide();
      },
      onPovChange: (y) => {
        draftPovY = y;
      },
      onShaftMove: (x, z) => {
        draftPovXZ = { x, z };
      },
      onRotate: (axis, angle) => {
        draftRotation
          .setFromAxisAngle(AXES[axis], angle)
          .multiply(rotationAtDragStart);
        applyLevel(draftRotation, draftPivot);
        rotateDegrees.value = (angle * 180) / Math.PI;
      },
      onRotateEnd: () => {
        rotationAtDragStart.copy(draftRotation);
        rotateDegrees.value = null;
        // Re-seat the grid at the scan's new floor, so the next adjustment is
        // judged against where the floor now is rather than where it was.
        const floor = measureScanBounds({ precise: true });
        if (!floor.isEmpty()) gizmo?.setGridFloor(floor.min.y);
      },
      onDragEnd: () => {
        // A dragged box is the admin's, so there is no longer a shrink to undo.
        boxBeforeShrink = null;
        if (cropMode.value === "remove") syncPovGuide();
      },
    });

    sizeToContainer(canvas);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dragstart", (e) => e.preventDefault());

    animate();
  }

  function sizeToContainer(canvas: HTMLCanvasElement) {
    if (!renderer || !camera) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? canvas.clientWidth;
    const h = parent?.clientHeight ?? canvas.clientHeight;
    const pr = renderer.getPixelRatio();
    const targetW = Math.round(w * pr);
    const targetH = Math.round(h * pr);
    if (
      renderer.domElement.width !== targetW ||
      renderer.domElement.height !== targetH
    ) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    if (renderer) {
      const canvas = renderer.domElement;
      sizeToContainer(canvas);
    }
    if (mode.value === "orbit" && controls) {
      // Auto-rotate is suppressed while cropping: a turning model makes the
      // handles impossible to aim, and the box would appear to drift.
      if (!userInteracted && !cropEditing.value && currentModel) {
        currentModel.rotation.y += 0.001;
        pinCentre();
      }
      // Skip controls.update() during flyTo. OrbitControls recomputes camera.position
      // from its internal spherical state each update, which overwrites tween values.
      if (!tweenActive) controls.update();
    }
    // After the model's transform has settled for this frame and before the
    // render that reads them.
    updateCropPlanes();
    gizmo?.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // Scans are photographed, not lit: the base color texture already contains the
  // real-world lighting. Rendering them with a PBR material means three re-lights
  // an already-lit image: dark surfaces pick up ambient and environment fill, and the
  // whole model reads faded. MeshBasicMaterial shows the texture exactly as
  // authored, and sidesteps the metallicFactor-defaults-to-1 black-model problem
  // entirely since metalness/roughness no longer participate.
  function toUnlitMaterial(src: THREE.Material): THREE.MeshBasicMaterial {
    const pbr = src as THREE.MeshStandardMaterial;
    const flat = new THREE.MeshBasicMaterial({
      name: src.name,
      map: pbr.map ?? null,
      color: pbr.color ? pbr.color.clone() : new THREE.Color(0xffffff),
      vertexColors: pbr.vertexColors ?? false,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaMap: pbr.alphaMap ?? null,
      alphaTest: src.alphaTest,
      side: src.side,
      depthWrite: src.depthWrite,
      toneMapped: false,
      // Left unset rather than given six inert planes on an uncropped scan.
      // The number of clipping planes is part of the shader's cache key, so
      // handing every model a full set would cost a per-fragment test on scans
      // that have nothing to clip.
      clippingPlanes: clippingActive ? cropWorldPlanes : undefined,
      // Paired with the planes' orientation in `setClipBox`; neither works
      // without the other. See there for why.
      clipIntersection: clipMode === "remove",
    });
    // Textures are handed to the new material, so only the material shell is
    // released here, since disposeMaterial() would take the maps down with it.
    src.dispose();
    return flat;
  }

  function applyFlatMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(toUnlitMaterial)
        : toUnlitMaterial(mesh.material);
    });
  }

  /* --- Crop ---------------------------------------------------------------- */

  function boxFromCrop(crop: CropBox): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(crop.minX, crop.minY, crop.minZ),
      new THREE.Vector3(crop.maxX, crop.maxY, crop.maxZ),
    );
  }

  function cropFromBox(box: THREE.Box3): CropBox {
    return {
      minX: box.min.x,
      minY: box.min.y,
      minZ: box.min.z,
      maxX: box.max.x,
      maxY: box.max.y,
      maxZ: box.max.z,
    };
  }

  /**
   * Whether a box is the scan's own bounds, to within a millimetre an admin
   * could not have aimed for. That case is stored as no crop at all rather than
   * as a box that happens to match, so Reset genuinely clears the columns.
   */
  /**
   * Whether this box, cropped this way, would leave nothing behind.
   *
   * Only `remove` can do that, and only by covering the scan's whole extent,
   * which is exactly the state that toggling to `remove` with an untouched box
   * would produce. A box test rather than a vertex count so it can run on every
   * drag frame; `survivingBounds` is the exact answer, once, at save.
   */
  function wouldEmptyScan(box: THREE.Box3, mode: CropMode): boolean {
    return mode === "remove" && box.containsBox(originalBounds);
  }

  /**
   * The bounding box of the geometry a `remove` crop leaves behind.
   *
   * Needed because in `remove` mode the drawn box is the part being deleted, so
   * it cannot be what the viewer centres and frames on. Walking every vertex is
   * the only way to find the real extent of what survives, and it is the whole
   * point of the tool: an artefact floating metres from the room inflates the
   * measured bounds, and only re-measuring without it pulls the framing in.
   *
   * Runs once, in the admin's browser, when a crop is saved. The result is
   * stored, so no visitor ever pays for it.
   */
  /**
   * Turns the level node to `rotation` about `pivot`.
   *
   * A rotation about the origin plus the translation that puts the pivot back
   * where it was: L = R · (q − p) + p. Turning about the scan's own middle
   * rather than the GLB's origin, which can be anywhere, keeps the scan in view
   * while it turns.
   */
  function applyLevel(rotation: THREE.Quaternion, pivot: THREE.Vector3) {
    if (!levelNode) return;
    levelNode.quaternion.copy(rotation);
    levelNode.position.copy(pivot).sub(pivot.clone().applyQuaternion(rotation));
  }

  function draftLevel(): Level | null {
    const level: Level = {
      rotation: {
        x: draftRotation.x,
        y: draftRotation.y,
        z: draftRotation.z,
        w: draftRotation.w,
      },
      pivot: { x: draftPivot.x, y: draftPivot.y, z: draftPivot.z },
    };
    return isLevelled(level) ? level : null;
  }

  function rotationOf(crop: Crop | null): THREE.Quaternion {
    const r = crop?.level?.rotation;
    return r
      ? new THREE.Quaternion(r.x, r.y, r.z, r.w)
      : new THREE.Quaternion();
  }

  /**
   * The centre of the scan as exported, in the level node's own space.
   *
   * The pivot a first levelling turns about. Mesh bounds rather than vertices,
   * since a pivot only has to be somewhere near the middle.
   */
  function rawCentre(): THREE.Vector3 {
    const bounds = new THREE.Box3().makeEmpty();
    if (!levelNode) return bounds.getCenter(new THREE.Vector3());
    levelNode.updateMatrixWorld(true);
    const inverse = levelNode.matrixWorld.clone().invert();
    const toLevel = new THREE.Matrix4();
    const meshBox = new THREE.Box3();
    levelNode.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      toLevel.multiplyMatrices(inverse, mesh.matrixWorld);
      bounds.union(
        meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(toLevel),
      );
    });
    return bounds.isEmpty()
      ? new THREE.Vector3()
      : bounds.getCenter(new THREE.Vector3());
  }

  function survivingBounds(box: THREE.Box3): THREE.Box3 {
    return measureScanBounds({
      exclude: box,
      precise: isLevelled(draftLevel()),
    });
  }

  /**
   * The scan's bounds in levelled local space, optionally leaving out whatever
   * lies inside `exclude`.
   *
   * `precise` walks every vertex rather than transforming each mesh's bounding
   * box. For an unturned scan the two agree, and the bounding boxes are far
   * cheaper. For a turned one the transformed box of a mesh is looser than the
   * mesh, by up to the square root of two at forty-five degrees, which would
   * frame a levelled scan from further back than it needs.
   */
  function measureScanBounds(
    options: { exclude?: THREE.Box3; precise?: boolean } = {},
  ): THREE.Box3 {
    const { exclude, precise = false } = options;
    const result = new THREE.Box3().makeEmpty();
    if (!currentModel) return result;

    currentModel.updateMatrixWorld(true);
    const modelInverse = new THREE.Matrix4()
      .copy(currentModel.matrixWorld)
      .invert();
    const toModel = new THREE.Matrix4();
    const vertex = new THREE.Vector3();
    const meshBox = new THREE.Box3();

    currentModel.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const position = mesh.geometry.attributes.position;
      if (!position) return;

      toModel.multiplyMatrices(modelInverse, mesh.matrixWorld);
      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;

      // A mesh nothing is excluded from keeps all of its geometry, so unless
      // precision is asked for its own bounds are enough and its vertices can
      // be skipped. Scans are usually a single mesh, so for a remove crop this
      // rarely fires, but it costs one box test.
      meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(toModel);
      if (!precise && (!exclude || !meshBox.intersectsBox(exclude))) {
        result.union(meshBox);
        return;
      }

      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(toModel);
        if (!exclude || !exclude.containsPoint(vertex))
          result.expandByPoint(vertex);
      }
    });

    return result;
  }

  /**
   * The box to clip against for a stored crop, or null when it cuts nothing.
   *
   * A crop saved only to move the POV eye keeps a `keep` box at the scan's full
   * bounds, which hides nothing. Treating that as no clipping keeps the scan off
   * the clipping shader, which every fragment would otherwise pay for.
   */
  function clipBoxOf(crop: Crop | null): THREE.Box3 | null {
    if (!crop) return null;
    const box = boxFromCrop(crop.box);
    if (crop.mode === "keep" && isFullBounds(box)) return null;
    return box;
  }

  /** `y` kept inside `frame`, clear of its floor and ceiling. */
  function clampPovTo(frame: THREE.Box3, y: number): number {
    return clampInsideEdges(y, frame.min.y, frame.max.y);
  }

  /** `xz` kept inside `frame`, clear of its walls. */
  function clampPovXZTo(
    frame: THREE.Box3,
    xz: { x: number; z: number },
  ): { x: number; z: number } {
    return {
      x: clampInsideEdges(xz.x, frame.min.x, frame.max.x),
      z: clampInsideEdges(xz.z, frame.min.z, frame.max.z),
    };
  }

  /**
   * Stands the POV guide in the frame the current draft would save with, and
   * seats the eye on it.
   *
   * Pass `frame` when it is already known, as it is for a stored `remove` crop
   * reopened for editing, to skip measuring the surviving geometry again.
   */
  function syncPovGuide(frame?: THREE.Box3) {
    if (!gizmo) return;
    if (frame) draftFrame.copy(frame);
    else {
      const box = gizmo.getBox();
      draftFrame.copy(cropMode.value === "keep" ? box : survivingBounds(box));
    }
    // A `remove` box covering the whole scan leaves no frame to stand in. The
    // panel is already refusing that state, so there is nothing to draw.
    if (draftFrame.isEmpty()) return;

    const wanted = draftFrame.getCenter(new THREE.Vector3());
    wanted.y = draftPovY ?? wanted.y + DEFAULT_POV_RISE;
    if (draftPovXZ) {
      wanted.x = draftPovXZ.x;
      wanted.z = draftPovXZ.z;
    }
    const seated = gizmo.setShaft(draftFrame, wanted);
    // An eye the admin placed that the resized frame no longer contains is
    // pulled back inside it, so what is saved is what is shown.
    if (draftPovY != null) draftPovY = seated.y;
    if (draftPovXZ) draftPovXZ = { x: seated.x, z: seated.z };
  }

  function isFullBounds(box: THREE.Box3): boolean {
    const epsilon = 1e-3;
    return (
      box.min.distanceTo(originalBounds.min) < epsilon &&
      box.max.distanceTo(originalBounds.max) < epsilon
    );
  }

  /**
   * Brings the model's world matrix up to date without walking its children.
   *
   * The clipping planes and the gizmo both need it before the renderer would
   * otherwise compute it, and `updateMatrixWorld()` recurses through every mesh
   * in the scan to do it. The model is parented straight to the scene, whose
   * transform is the identity, so its local matrix is already its world matrix
   * and the recursion buys nothing.
   */
  function syncModelMatrix() {
    if (!currentModel) return;
    currentModel.updateMatrix();
    currentModel.matrixWorld.copy(currentModel.matrix);
  }

  /**
   * Keeps the frame's centre on the world origin whatever the model's turn.
   *
   * three applies an object's rotation before its position, so a model offset
   * by a plain −C turns about the GLB's own origin, not about C. For a scan
   * whose room sits metres from that origin, auto-rotate swings the room round
   * in a wide circle and leaves the orbit pivot at (0, 0, 0) out in empty air.
   * Offsetting by −Ry(θ)·C instead gives world = Ry(θ)·(L − C), which turns
   * about the centre. Must follow every change to `rotation.y`.
   */
  function pinCentre() {
    if (!currentModel) return;
    currentModel.position
      .copy(appliedCentre)
      .applyAxisAngle(Y_AXIS, currentModel.rotation.y)
      .negate();
  }

  /**
   * Where the old transform put the frame's centre at turn θ, relative to
   * where `pinCentre` puts it: C − Ry(θ)·C.
   *
   * Annotation cameras are stored in the old convention, world = Ry(θ)·L − C,
   * which reframeAnnotation in shared/utils/levelling.ts is written against and
   * every saved row already uses. Converting at the two edges, saving a
   * snapshot and flying to one, keeps them valid without a migration.
   */
  function storedCameraOffset(theta: number): THREE.Vector3 {
    return appliedCentre
      .clone()
      .sub(appliedCentre.clone().applyAxisAngle(Y_AXIS, theta));
  }

  function applyClippingToMaterials() {
    if (!currentModel) return;
    // Null, not undefined: three's typings take `undefined` on the constructor
    // options and `null` on the property, and they are not interchangeable.
    const planes = clippingActive ? cropWorldPlanes : null;
    const intersection = clipMode === "remove";
    currentModel.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        material.clippingPlanes = planes;
        material.clipIntersection = intersection;
        // Going between no planes and six changes the shader, not just a
        // uniform, so the program has to be rebuilt. Moving a plane does not,
        // which is why this only runs when clipping is switched on or off.
        material.needsUpdate = true;
      }
    });
  }

  /**
   * Points the clipping planes at `box`, or turns clipping off when it is null.
   *
   * The planes are written in the model's local space here and transformed to
   * world space per frame (see `updateCropPlanes`).
   *
   * Three discards a fragment on a plane's negative side, and the two modes
   * need the planes facing opposite ways, not just a different combining rule:
   *
   * - `keep` faces them inward and leaves `clipIntersection` off, so a fragment
   *   is discarded if it is behind any one of them: outside the box.
   * - `remove` faces them outward and turns `clipIntersection` on, so a fragment
   *   is discarded only if it is behind all six: strictly inside the box.
   *
   * Turning `clipIntersection` on with the planes still facing inward does
   * nothing at all, because "behind all six" would then mean left of the box's
   * minimum and right of its maximum at once, which no point can be. That was
   * the original bug in `remove` mode.
   */
  function setClipBox(box: THREE.Box3 | null, mode: CropMode = "keep") {
    const wasActive = clippingActive;
    const wasMode = clipMode;
    clippingActive = box !== null;
    clipMode = mode;

    if (box) {
      clipBox.copy(box);
      cropLocalPlanes[0].set(new THREE.Vector3(1, 0, 0), -box.min.x);
      cropLocalPlanes[1].set(new THREE.Vector3(-1, 0, 0), box.max.x);
      cropLocalPlanes[2].set(new THREE.Vector3(0, 1, 0), -box.min.y);
      cropLocalPlanes[3].set(new THREE.Vector3(0, -1, 0), box.max.y);
      cropLocalPlanes[4].set(new THREE.Vector3(0, 0, 1), -box.min.z);
      cropLocalPlanes[5].set(new THREE.Vector3(0, 0, -1), box.max.z);
      if (mode === "remove")
        for (const plane of cropLocalPlanes) plane.negate();
      updateCropPlanes();
    }

    // Both the number of planes and `clipIntersection` are compiled into the
    // shader, so either changing means the program has to be rebuilt. Moving a
    // plane does not, which is why a drag does not come through here.
    if (wasActive !== clippingActive || wasMode !== clipMode)
      applyClippingToMaterials();
  }

  /**
   * Re-derives the world-space clipping planes from the model's transform.
   *
   * Runs every frame because clipping planes are world-space while the crop is
   * defined against the geometry, and the model turns: `animate` auto-rotates
   * it, and `flyTo` tweens it to an annotation's stored rotation. Planes fixed
   * in world space would stay put and slice through a turning scan.
   */
  function updateCropPlanes() {
    if (!clippingActive || !currentModel) return;
    syncModelMatrix();
    for (let i = 0; i < 6; i++) {
      cropWorldPlanes[i]
        .copy(cropLocalPlanes[i])
        .applyMatrix4(currentModel.matrixWorld);
    }
  }

  /**
   * The first intersection that is not on cropped-away geometry.
   *
   * Clipping is a fragment-stage operation, so the triangles it hides are still
   * there as far as the raycaster is concerned. Without this an annotation
   * could be placed on invisible geometry, and the orbit pivot could anchor
   * itself to a fragment the admin cropped out precisely because it was
   * nowhere near the room. Hits arrive sorted by distance, so the first one
   * inside the box is the nearest visible surface.
   */
  function firstVisibleHit(
    hits: THREE.Intersection[],
  ): THREE.Intersection | undefined {
    if (!clippingActive || !currentModel) return hits[0];
    const local = new THREE.Vector3();
    return hits.find((hit) => {
      local.copy(hit.point);
      currentModel!.worldToLocal(local);
      // Inside the box is what survives in `keep` mode and what is gone in
      // `remove` mode, so the same test answers both, negated.
      return clipBox.containsPoint(local) === (clipMode === "keep");
    });
  }

  /**
   * Centres the model on `box` and frames the camera to fit it.
   *
   * Everything the viewer knows about scale comes from here, which is why a
   * crop corrects so much at once: the centre the model is offset by, the orbit
   * distance, the near and far planes, the floor under the dolly step, and the
   * radius the pivot probe falls back to.
   */
  function frameOn(box: THREE.Box3) {
    if (!currentModel) return;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    appliedBox.copy(box);
    appliedCentre.copy(centre);
    pinCentre();
    modelRadius = (Math.max(size.x, size.y, size.z) || 1) / 2;

    if (!camera || !controls) return;

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.4;
    orbitDistance = distance;

    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 100;
    // Backstop for the degenerate case the pivot probe can't catch (zooming
    // into empty space): a radius of exactly 0 leaves OrbitControls with no
    // step size at all and the viewer permanently stuck.
    controls.minDistance = distance * 0.005;

    if (mode.value === "pov") {
      controls.enabled = false;
      camera.fov = povState.fov;
      povPosition(camera.position);
      povState.rotationX = 0;
      povState.rotationY = 0;
      applyPovRotation();
    } else {
      controls.enabled = true;
      camera.position.set(distance * 0.7, distance * 0.5, distance * 0.8);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    camera.updateProjectionMatrix();
  }

  async function loadModel(url: string) {
    if (!scene) return;
    loading.value = true;
    error.value = null;
    userInteracted = false;
    const myId = ++loadId;

    const profile = createLoadProfiler(url);

    if (currentModel) {
      scene.remove(currentModel);
      disposeObject(currentModel);
      currentModel = null;
      profile?.phase("dispose");
    }

    try {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(getDracoLoader());
      const gltf = await loader.loadAsync(url);
      if (myId !== loadId) return;
      profile?.phase("fetch+parse");

      currentModel = new THREE.Group();
      levelNode = new THREE.Group();
      levelNode.add(gltf.scene);
      currentModel.add(levelNode);
      scene.add(currentModel);

      const stored = storedCrop.value ?? null;
      committedCrop = stored;
      committedRotation.copy(rotationOf(stored));
      if (stored?.level) {
        const { pivot } = stored.level;
        applyLevel(
          rotationOf(stored),
          new THREE.Vector3(pivot.x, pivot.y, pivot.z),
        );
      }

      // Measured before anything moves the model, so this is the scan's own
      // levelled bounds. Not precise even for a levelled scan: a levelled scan
      // always has a stored crop, whose frame is what the viewer centres on,
      // so the looser measurement never reaches a visitor's framing and every
      // visitor is spared walking the scan's vertices. The crop tool measures
      // precisely when it opens.
      originalBounds.copy(measureScanBounds());
      // Before the materials are built, so they are created with the right
      // number of clipping planes, and the right clipping mode, instead of
      // being rebuilt a moment later.
      setClipBox(clipBoxOf(stored), stored?.mode ?? "keep");
      applyFlatMaterials(currentModel);
      // The frame box, not the drawn one: in `remove` mode they are different
      // boxes and the drawn one is the part that is gone.
      frameOn(stored ? boxFromCrop(stored.frame) : originalBounds);

      profile?.phase("scene add+frame");
      profile?.total();
      profile?.census(currentModel, renderer);
    } catch (e) {
      if (myId === loadId)
        error.value = (e as Error).message ?? "Failed to load model";
    } finally {
      if (myId === loadId) loading.value = false;
    }
  }

  /**
   * Opens the crop gizmo on whatever is currently in force.
   *
   * In two parts. `cropEditing` turns on at once, which is what the viewer's
   * controls respond to. The scene work, showing the box, switching clipping on
   * and reframing the camera, follows after `sceneDelayMs`. The first time in a
   * session that work compiles shaders: the scan's, rebuilt with clipping
   * planes, and the gizmo's own. That stalls the main thread for a frame or
   * several, and done at the same moment it lands in the middle of the
   * controls' opening animation. Deferred until the animation has run, the
   * buttons slide cleanly and the box appears as they settle.
   *
   * Clipping is switched on even when there is no crop yet, with the planes at
   * the scan's own bounds where they cut nothing. That way the first drag
   * trims immediately rather than having to turn clipping on mid-gesture and
   * rebuild every shader in the middle of the drag.
   */
  function startCrop(options: { sceneDelayMs?: number } = {}) {
    if (!gizmo || !currentModel || !camera || !controls) return;
    // Mutually exclusive with placing an annotation: both want the pointer, and
    // a click meant for a handle must not leave a marker behind it.
    createMode.value = false;
    cropEditing.value = true;
    cropReady.value = false;
    userInteracted = true;

    // Captured now, before anything in the scene moves, so Cancel restores the
    // view the admin actually had.
    viewBeforeCrop = {
      mode: mode.value,
      fov: camera.fov,
      position: camera.position.clone(),
      target: controls.target.clone(),
      rotationX: povState.rotationX,
      rotationY: povState.rotationY,
    };

    const token = ++cropStartToken;
    const delay = options.sceneDelayMs ?? 0;
    if (delay > 0) setTimeout(() => setUpCropScene(token), delay);
    else setUpCropScene(token);
  }

  function setUpCropScene(token: number) {
    // A cancel or another open since startCrop ran makes this one stale.
    if (token !== cropStartToken || !cropEditing.value) return;
    if (!gizmo || !currentModel) return;

    // The box is dragged from outside it. From POV's vantage point inside the
    // scan the faces surround the camera and most handles are behind it.
    if (mode.value === "pov") setMode("orbit");

    // The levelling in force is where editing starts. A scan levelled before
    // gets its bounds measured precisely now, so the box's ceiling and the
    // "is this the whole scan" test agree with the precise box it was saved
    // with.
    const level = committedCrop?.level;
    draftRotation.copy(rotationOf(committedCrop));
    if (level) draftPivot.set(level.pivot.x, level.pivot.y, level.pivot.z);
    else draftPivot.copy(rawCentre());
    rotationAtDragStart.copy(draftRotation);
    rotationAtToolStart.copy(draftRotation);
    cropTool.value = "box";
    rotateDegrees.value = null;
    if (level) originalBounds.copy(measureScanBounds({ precise: true }));

    const initial = committedCrop
      ? boxFromCrop(committedCrop.box)
      : originalBounds.clone();
    cropMode.value = committedCrop?.mode ?? "keep";
    draftPovY = committedCrop?.povY ?? null;
    draftPovXZ =
      committedCrop?.povX != null && committedCrop.povZ != null
        ? { x: committedCrop.povX, z: committedCrop.povZ }
        : null;
    boxBeforeShrink = null;
    setClipBox(initial, cropMode.value);
    gizmo.show(initial, originalBounds);
    // A stored `remove` crop already knows its frame, so reopening one does not
    // walk the scan's vertices just to stand the guide back where it was.
    syncPovGuide(
      committedCrop?.mode === "remove"
        ? boxFromCrop(committedCrop.frame)
        : undefined,
    );
    frameWholeBox(initial);
    cropDraft.value = cropFromBox(initial);
    cropEmptiesScan.value = wouldEmptyScan(initial, cropMode.value);
    cropReady.value = true;
  }

  /**
   * Pulls the orbit camera back until every corner of `box` is in view.
   *
   * The ordinary framing in `frameOn` sizes the camera distance off the box's
   * longest side and the vertical field of view alone, which suits looking at a
   * scan but not editing one: the box's corners stick out past that fit, and in
   * a viewer narrower than it is tall they fall off the sides as well, taking
   * their handles with them. This fits the box's bounding sphere against the
   * narrower of the two fields of view instead, keeping the current viewing
   * direction so the admin is not spun round to a different side of the scan.
   */
  function frameWholeBox(box: THREE.Box3) {
    if (!camera || !controls || !currentModel) return;
    syncModelMatrix();

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.center.applyMatrix4(currentModel.matrixWorld);

    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const distance =
      (sphere.radius / Math.sin(Math.min(vertical, horizontal) / 2)) *
      CROP_FRAME_MARGIN;

    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(0.7, 0.5, 0.8);
    direction.normalize();

    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.far = Math.max(camera.far, distance * 10);
    camera.updateProjectionMatrix();
    controls.update();
  }

  /** Abandons the edit. The model was never re-centred, so only clipping moves. */
  function cancelCrop() {
    if (!gizmo) return;
    // Drops a scene setup still waiting on its delay.
    cropStartToken++;
    cropReady.value = false;
    cropEditing.value = false;
    gizmo.hide();
    cropDraft.value = null;
    cropEmptiesScan.value = false;
    cropMode.value = committedCrop?.mode ?? "keep";
    draftPovY = null;
    draftPovXZ = null;
    boxBeforeShrink = null;
    cropTool.value = "box";
    rotateDegrees.value = null;
    // Turn the scan back if a rotation was being tried, and re-measure against
    // the rotation that is actually in force.
    const committedRotation = rotationOf(committedCrop);
    if (committedRotation.angleTo(draftRotation) > ROTATION_EPSILON) {
      const pivot = committedCrop?.level?.pivot;
      applyLevel(
        committedRotation,
        pivot ? new THREE.Vector3(pivot.x, pivot.y, pivot.z) : draftPivot,
      );
      draftRotation.copy(committedRotation);
      originalBounds.copy(
        measureScanBounds({ precise: Boolean(committedCrop?.level) }),
      );
    }
    setClipBox(clipBoxOf(committedCrop), committedCrop?.mode ?? "keep");
    restoreViewBeforeCrop();
  }

  /**
   * Puts the camera back where it was before the crop tool framed the box.
   *
   * Only Cancel does this. Saving re-frames on the new crop instead, because
   * the view from before no longer points at the centre of anything.
   */
  function restoreViewBeforeCrop() {
    const view = viewBeforeCrop;
    viewBeforeCrop = null;
    if (!view || !camera || !controls) return;

    if (view.mode === "pov") {
      setMode("pov");
      povState.fov = view.fov;
      camera.fov = view.fov;
      povState.rotationX = view.rotationX;
      povState.rotationY = view.rotationY;
      applyPovRotation();
    } else {
      camera.fov = view.fov;
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.update();
    }
    camera.updateProjectionMatrix();
  }

  /**
   * Back to an untouched scan: the box at full bounds, keeping what is inside,
   * with the POV eye back at its default height.
   *
   * Resetting the mode as well as the box matters, because full bounds means
   * opposite things either way round. Left on `remove` it would read as "delete
   * everything" rather than "no crop", which is not what a reset should offer.
   */
  function resetCropBox() {
    if (!gizmo || !cropReady.value) return;
    cropMode.value = "keep";
    draftPovY = null;
    draftPovXZ = null;
    boxBeforeShrink = null;
    rotateDegrees.value = null;

    // Reset means an untouched scan, so the levelling goes too.
    const wasTurned =
      draftRotation.angleTo(new THREE.Quaternion()) > ROTATION_EPSILON;
    draftRotation.identity();
    rotationAtDragStart.identity();
    rotationAtToolStart.identity();
    if (wasTurned) {
      applyLevel(draftRotation, draftPivot);
      originalBounds.copy(measureScanBounds());
    }

    cropTool.value = "box";
    gizmo.show(originalBounds.clone(), originalBounds);
    // Redraws, re-clips and re-seats the POV guide through the gizmo's onChange.
    gizmo.setBox(originalBounds.clone());
    if (wasTurned) frameWholeBox(originalBounds);
  }

  /**
   * Switches the crop tool between resizing the box and turning the scan.
   *
   * Turning a scan changes its bounds and tips any box drawn against the old
   * ones out of true, so coming back from a rotation that changed anything
   * fits the box to the newly levelled scan, in `keep` mode, with the eye back
   * at its default. Rather than try to carry a removal box through a rotation,
   * which could only grow it and delete more than was meant, levelling is
   * treated as the step before cropping. `boxReset` says whether a box that was
   * already drawn was lost to it, so the viewer can say so.
   */
  function setCropTool(next: CropGizmoTool): { boxReset: boolean } {
    const unchanged = { boxReset: false };
    if (!gizmo || !cropReady.value || cropTool.value === next) return unchanged;

    if (next === "rotate") {
      rotationAtToolStart.copy(draftRotation);
      rotationAtDragStart.copy(draftRotation);
      cropTool.value = "rotate";
      // The box stays fixed in levelled space while the scan turns through it,
      // which would cut the scan apart mid-turn, so the whole scan shows while
      // rotating and the box's clipping comes back afterwards.
      setClipBox(null);
      const size = originalBounds.getSize(new THREE.Vector3());
      gizmo.setTool("rotate", {
        centre: draftPivot,
        size: Math.max(size.x, size.y, size.z),
        floorY: originalBounds.min.y,
      });
      return unchanged;
    }

    cropTool.value = "box";
    rotateDegrees.value = null;
    if (rotationAtToolStart.angleTo(draftRotation) <= ROTATION_EPSILON) {
      gizmo.setTool("box");
      setClipBox(gizmo.getBox(), cropMode.value);
      return unchanged;
    }

    const drawn = gizmo.getBox();
    const hadBox =
      cropMode.value !== "keep" ||
      !isFullBounds(drawn) ||
      draftPovY != null ||
      draftPovXZ != null;

    originalBounds.copy(measureScanBounds({ precise: true }));
    cropMode.value = "keep";
    draftPovY = null;
    draftPovXZ = null;
    boxBeforeShrink = null;
    gizmo.show(originalBounds.clone(), originalBounds);
    gizmo.setBox(originalBounds.clone());
    frameWholeBox(originalBounds);
    return { boxReset: hadBox };
  }

  /**
   * Switches which side of the box survives.
   *
   * Toggling to `remove` with the box still at full bounds would black the
   * viewer out, since everything is inside it. Rather than let that happen the
   * box is pulled in to a quarter of each axis around its own centre, which is
   * a visible starting size to drag onto whatever is being deleted.
   */
  function setCropMode(next: CropMode) {
    if (!gizmo || !cropReady.value || cropMode.value === next) return;
    cropMode.value = next;

    let box = gizmo.getBox();
    if (next === "keep" && boxBeforeShrink) {
      // Back to `keep` without the shrunk box having been touched: put back
      // the box it replaced. Through onChange, like the shrink itself.
      const restored = boxBeforeShrink;
      boxBeforeShrink = null;
      gizmo.setBox(restored);
    } else if (wouldEmptyScan(box, next)) {
      boxBeforeShrink = box.clone();
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.25);
      box = new THREE.Box3().setFromCenterAndSize(centre, size);
      // Redraws, re-clips and refreshes the draft through the gizmo's onChange.
      gizmo.setBox(box);
    } else {
      setClipBox(box, next);
      cropEmptiesScan.value = wouldEmptyScan(box, next);
    }
    // The frame changes meaning with the mode, and onChange only re-seats the
    // guide for `keep`, so it is re-stood here whichever way the switch went.
    syncPovGuide();
  }

  /**
   * Whether the draft differs from the crop already in force.
   *
   * The crop button both opens the tool and saves it, so pressing it twice
   * without touching anything is a natural way to close it. Without this that
   * would re-save the same crop, re-render its thumbnail and log an admin action
   * that changed nothing.
   */
  function cropHasChanges(): boolean {
    if (!gizmo || !cropReady.value) return false;
    const box = gizmo.getBox();

    if (rotationOf(committedCrop).angleTo(draftRotation) > ROTATION_EPSILON)
      return true;

    if (!committedCrop) {
      return !(
        cropMode.value === "keep" &&
        isFullBounds(box) &&
        draftPovY == null &&
        draftPovXZ == null
      );
    }

    // Tighter than isFullBounds' millimetre, since this compares a box against
    // the same box read back, not against a measurement.
    const epsilon = 1e-4;
    if (committedCrop.mode !== cropMode.value) return true;
    const stored = boxFromCrop(committedCrop.box);
    if (
      stored.min.distanceTo(box.min) > epsilon ||
      stored.max.distanceTo(box.max) > epsilon
    )
      return true;

    const before = committedCrop.povY ?? null;
    if ((before == null) !== (draftPovY == null)) return true;
    if (
      before != null &&
      draftPovY != null &&
      Math.abs(before - draftPovY) > epsilon
    )
      return true;

    const { povX, povZ } = committedCrop;
    const beforeXZ = povX != null && povZ != null ? { x: povX, z: povZ } : null;
    if ((beforeXZ == null) !== (draftPovXZ == null)) return true;
    return (
      beforeXZ != null &&
      draftPovXZ != null &&
      Math.hypot(beforeXZ.x - draftPovXZ.x, beforeXZ.z - draftPovXZ.z) > epsilon
    );
  }

  /**
   * What the drawn box would save as, computed without changing anything.
   *
   * Separate from applying it so the caller can put the request first and only
   * move the viewer once the save has landed. Re-framing optimistically and
   * then having the POST fail would leave the admin looking at a crop that was
   * not stored.
   *
   * The re-centre is the part with consequences beyond this session. World
   * space in the viewer is the model's local space minus the centre of
   * whichever box is applied, so moving that centre moves every world-space
   * coordinate recorded against this entry. Annotation points are model-local
   * and ride along untouched; annotation cameras are not, which is what the
   * delta is for.
   */
  function pendingCrop(): CropResult | null {
    // A rotate session has to be closed first, which fits the box to the new
    // level; saving mid-rotation would store a box drawn for the old one.
    if (!gizmo || !currentModel || !cropReady.value || cropTool.value !== "box")
      return null;

    const box = gizmo.getBox();
    const mode = cropMode.value;
    const level = draftLevel();

    // A `keep` box at the scan's own bounds keeps everything, which is stored
    // as no crop rather than as a box that happens to match. That is what Reset
    // then Confirm does. `remove` has no such state: an empty removal box is
    // not something the gizmo can express. A moved POV eye still needs saving,
    // though, so a full-bounds box with one is kept as a crop that cuts nothing.
    const cleared =
      mode === "keep" &&
      isFullBounds(box) &&
      draftPovY == null &&
      draftPovXZ == null &&
      !level;

    // The frame box is the drawn box in `keep` mode and the surviving geometry
    // in `remove` mode, where the drawn box is the part being deleted.
    const frame = cleared
      ? originalBounds
      : mode === "keep"
        ? box
        : survivingBounds(box);

    // Nothing survived, so there is no scan left to frame or look at. The panel
    // stops this being reachable, and this is the backstop behind it.
    if (frame.isEmpty()) return null;

    const centreAfter = frame.getCenter(new THREE.Vector3());

    // Re-seated against the frame actually being saved. In `remove` mode that
    // frame was just measured and can differ from the one the guide last stood
    // in, and the server refuses an eye outside its frame.
    const povY = draftPovY == null ? undefined : clampPovTo(frame, draftPovY);
    const povXZ = draftPovXZ && clampPovXZTo(frame, draftPovXZ);

    return {
      crop: cleared
        ? null
        : {
            mode,
            box: cropFromBox(box),
            frame: cropFromBox(frame),
            ...(povY == null ? {} : { povY }),
            ...(povXZ ? { povX: povXZ.x, povZ: povXZ.z } : {}),
            ...(level ? { level } : {}),
          },
      centreBefore: {
        x: appliedCentre.x,
        y: appliedCentre.y,
        z: appliedCentre.z,
      },
      centreAfter: { x: centreAfter.x, y: centreAfter.y, z: centreAfter.z },
    };
  }

  /**
   * Applies a crop and closes the editor. For use once the save has landed.
   *
   * Takes the result rather than recomputing it, so a `remove` crop walks the
   * scan's vertices once per save instead of twice.
   */
  function applyPendingCrop(result: CropResult) {
    if (!gizmo || !currentModel) return;

    committedCrop = result.crop;
    committedRotation.copy(rotationOf(result.crop));
    setClipBox(clipBoxOf(result.crop), result.crop?.mode ?? "keep");
    viewBeforeCrop = null;
    frameOn(result.crop ? boxFromCrop(result.crop.frame) : originalBounds);

    cropEditing.value = false;
    cropReady.value = false;
    gizmo.hide();
    cropDraft.value = null;
    cropEmptiesScan.value = false;
    draftPovY = null;
    draftPovXZ = null;
    boxBeforeShrink = null;
    cropTool.value = "box";
    rotateDegrees.value = null;
  }

  function setMode(next: ViewMode) {
    if (!camera || !controls) return;
    mode.value = next;
    if (next === "orbit") {
      controls.enabled = true;
      camera.fov = 70;
      camera.position.set(
        orbitDistance * 0.7,
        orbitDistance * 0.5,
        orbitDistance * 0.8,
      );
      controls.target.set(0, 0, 0);
      controls.update();
    } else {
      controls.enabled = false;
      camera.fov = povState.fov;
      povPosition(camera.position);
      povState.rotationX = 0;
      povState.rotationY = 0;
      applyPovRotation();
    }
    camera.updateProjectionMatrix();
  }

  function pickPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    if (!camera || !renderer || !currentModel) return null;
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = firstVisibleHit(raycaster.intersectObject(currentModel, true));
    if (!hit) return null;
    // Store in model-local space so the point tracks the model as it auto-rotates
    return currentModel.worldToLocal(hit.point.clone());
  }

  // OrbitControls sizes both the dolly step and the pan step from the distance
  // between the camera and controls.target, so the pivot, not the geometry,
  // decides how fast the viewer moves. The target sits at the scan's centre,
  // which for a room scan is empty air: zoom in past a wall and the radius
  // collapses toward zero while the surfaces on screen are still metres away.
  // Every wheel tick then dollies a fraction of that tiny radius and a full drag
  // pans almost nothing, which reads as the viewer seizing up near the model.
  //
  // Fix the pivot rather than the speeds: push the target back out onto whatever
  // surface lies along the camera's forward axis, so the radius tracks what's
  // actually on screen. The camera is never touched, and OrbitControls recomputes
  // its offset from the live target each update(), so the view is identical
  // before and after, only the step size is corrected.
  function reanchorOrbitTarget(force = false) {
    if (!camera || !controls || !currentModel) return;
    if (mode.value !== "orbit" || tweenActive) return;
    // The pivot must not move under a crop drag: OrbitControls sizes its steps
    // from it, and the gizmo's drag plane is built once at pointerdown.
    if (cropEditing.value) return;

    const radius = camera.position.distanceTo(controls.target);
    // Cap it so a long ray across the scan can't fling the pivot somewhere that
    // makes the controls overshoot instead.
    const maxWanted = orbitDistance * 2;
    // Exact early-out: past this radius no hit distance could clear PROBE_RATIO,
    // so there is nothing to correct and the raycast is skipped. Keeps the common
    // case, orbiting at a normal distance, free of any per-click mesh work.
    if (radius * PROBE_RATIO > maxWanted) return;

    const now = performance.now();
    if (!force && now - lastProbeAt < PROBE_INTERVAL_MS) return;
    lastProbeAt = now;

    camera.getWorldDirection(probeDir);

    probeRaycaster.set(camera.position, probeDir);
    probeRaycaster.near = 0;
    probeRaycaster.far = orbitDistance * 4;
    const hit = firstVisibleHit(
      probeRaycaster.intersectObject(currentModel, true),
    );

    // A miss means the camera is looking into empty space (out a doorway, off the edge of
    // the scan), so fall back to the model's own scale rather than leaving the
    // pivot collapsed.
    const surfaceDistance = hit ? hit.distance : modelRadius;
    const wanted = Math.min(surfaceDistance, maxWanted);

    if (!(wanted > 0) || wanted < radius * PROBE_RATIO) return;

    controls.target.copy(camera.position).addScaledVector(probeDir, wanted);
  }

  function getCameraSnapshot(): CameraSnapshot {
    const modelRotationY = currentModel?.rotation.y ?? 0;
    if (!camera) {
      return { cameraMode: "orbit", cameraFov: 70, modelRotationY };
    }
    if (mode.value === "orbit") {
      const offset = storedCameraOffset(modelRotationY);
      const position = camera.position.clone().sub(offset);
      const target = (controls?.target.clone() ?? new THREE.Vector3()).sub(
        offset,
      );
      return {
        cameraMode: "orbit",
        cameraFov: camera.fov,
        modelRotationY,
        orbitPosX: position.x,
        orbitPosY: position.y,
        orbitPosZ: position.z,
        orbitTargetX: target.x,
        orbitTargetY: target.y,
        orbitTargetZ: target.z,
      };
    } else {
      return {
        cameraMode: "pov",
        cameraFov: camera.fov,
        modelRotationY,
        rotationX: povState.rotationX,
        rotationY: povState.rotationY,
      };
    }
  }

  function easeInOut(t: number) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function flyTo(snapshot: CameraSnapshot, duration = 800) {
    if (!camera || !controls) return;

    cancelAnimationFrame(tweenRaf);
    tweenActive = true;
    if (controls) controls.enabled = false;

    // Switch mode first if needed
    if (snapshot.cameraMode !== mode.value) {
      mode.value = snapshot.cameraMode as ViewMode;
      if (snapshot.cameraMode === "pov") {
        controls.enabled = false;
        povPosition(camera.position);
        povState.rotationX = snapshot.rotationX ?? 0;
        povState.rotationY = snapshot.rotationY ?? 0;
        // Drop orbit's orientation now rather than carrying its roll into the
        // tween's first frame.
        applyPovRotation();
      }
    }

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startFov = camera.fov;
    const startRotX = povState.rotationX;
    const startRotY = povState.rotationY;
    const startModelRotY = currentModel?.rotation.y ?? 0;
    const startTime = performance.now();

    // Shortest-path delta for model rotation
    const targetModelRotY = snapshot.modelRotationY ?? startModelRotY;
    let deltaModelRotY = targetModelRotY - startModelRotY;
    while (deltaModelRotY > Math.PI) deltaModelRotY -= Math.PI * 2;
    while (deltaModelRotY < -Math.PI) deltaModelRotY += Math.PI * 2;

    let targetPos: THREE.Vector3;
    let targetTarget: THREE.Vector3;
    let targetFov: number;
    let targetRotX = startRotX;
    let targetRotY = startRotY;

    if (snapshot.cameraMode === "orbit") {
      targetPos = new THREE.Vector3(
        snapshot.orbitPosX ?? 0,
        snapshot.orbitPosY ?? 0,
        snapshot.orbitPosZ ?? 4,
      );
      targetTarget = new THREE.Vector3(
        snapshot.orbitTargetX ?? 0,
        snapshot.orbitTargetY ?? 0,
        snapshot.orbitTargetZ ?? 0,
      );
      const offset = storedCameraOffset(targetModelRotY);
      targetPos.add(offset);
      targetTarget.add(offset);
      targetFov = snapshot.cameraFov;
    } else {
      // At the turn the tween ends on: an eye off the centre turns with the model.
      targetPos = povPosition(new THREE.Vector3(), targetModelRotY);
      targetTarget = new THREE.Vector3(0, 0, 0);
      targetFov = snapshot.cameraFov;
      targetRotX = snapshot.rotationX ?? 0;
      targetRotY = snapshot.rotationY ?? 0;
    }

    function tick() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const e = easeInOut(t);

      if (!camera) return;

      camera.position.lerpVectors(startPos, targetPos, e);
      camera.fov = startFov + (targetFov - startFov) * e;
      camera.updateProjectionMatrix();

      if (currentModel) {
        currentModel.rotation.y = startModelRotY + deltaModelRotY * e;
        pinCentre();
      }

      if (snapshot.cameraMode === "pov") {
        povState.rotationX = startRotX + (targetRotX - startRotX) * e;
        povState.rotationY = startRotY + (targetRotY - startRotY) * e;
        applyPovRotation();
      } else if (controls) {
        controls.target.lerpVectors(startTarget, targetTarget, e);
        camera.lookAt(controls.target);
      }

      if (t < 1) {
        tweenRaf = requestAnimationFrame(tick);
      } else {
        tweenActive = false;
        userInteracted = true; // stop auto-rotate so the annotation view holds
        if (snapshot.cameraMode === "orbit" && controls) {
          controls.enabled = true;
          controls.target.copy(targetTarget);
          // Drain accumulated sphericalDelta instantly (non-damped flush), then
          // re-lock camera to the exact target position before re-enabling damping.
          const hadDamping = controls.enableDamping;
          controls.enableDamping = false;
          controls.update(); // zeros _sphericalDelta
          controls.enableDamping = hadDamping;
          camera.position.copy(targetPos);
          camera.lookAt(controls.target);
          controls.update(); // sync internal spherical to final position
        }
      }
    }

    tweenRaf = requestAnimationFrame(tick);
  }

  function captureThumb(): string | null {
    if (!scene || !currentModel) return null;

    const offCanvas = document.createElement("canvas");
    offCanvas.width = 800;
    offCanvas.height = 800;

    let offRenderer: THREE.WebGLRenderer | null = null;
    try {
      offRenderer = new THREE.WebGLRenderer({
        canvas: offCanvas,
        antialias: true,
      });
      offRenderer.setPixelRatio(1);
      offRenderer.setSize(800, 800, false);
      offRenderer.setClearColor(0x000000);
      offRenderer.toneMapping = THREE.NoToneMapping;
      offRenderer.outputColorSpace = THREE.SRGBColorSpace;
      // Its own renderer, so it needs its own permission to clip. Without this
      // the thumbnail captured right after a crop would show the geometry the
      // crop had just removed.
      offRenderer.localClippingEnabled = true;

      const thumbCam = new THREE.PerspectiveCamera(70, 1, 0.01, 1000);
      // The applied box rather than a fresh measurement: `setFromObject` would
      // report the whole scan including the cropped-away parts, and frame the
      // thumbnail for geometry that is not in the picture.
      const size = appliedBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fovRad = (70 * Math.PI) / 180;
      const dist = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.4;
      thumbCam.position.set(dist * 0.7, dist * 0.5, dist * 0.8);
      thumbCam.near = Math.max(dist / 1000, 0.01);
      thumbCam.far = dist * 100;
      thumbCam.lookAt(0, 0, 0);
      thumbCam.updateProjectionMatrix();

      const savedRotY = currentModel.rotation.y;
      currentModel.rotation.y = 0;
      pinCentre();
      // The planes are refreshed once per animation frame from the model's
      // matrix, so straightening the model here leaves them a rotation behind.
      // Rendering against those would cut the thumbnail on the diagonal.
      updateCropPlanes();
      offRenderer.render(scene, thumbCam);
      const dataUrl = offCanvas.toDataURL("image/jpeg", 0.85);
      currentModel.rotation.y = savedRotY;
      pinCentre();
      updateCropPlanes();
      return dataUrl;
    } finally {
      offRenderer?.dispose();
    }
  }

  /**
   * Where a stored annotation point sits once the rotation being edited is
   * saved.
   *
   * Annotation points are stored against the rotation in force, and the server
   * moves them only when a new one is saved. While a rotation is being tried
   * the scan turns beneath them, so without this their markers would stay where
   * they were and float off their surfaces, and the count of annotations a box
   * would strand would be checked against points in the wrong place. This is
   * the same move the server makes, about the same pivot.
   */
  function toDraftSpace(
    point: THREE.Vector3,
    out = new THREE.Vector3(),
  ): THREE.Vector3 {
    out.copy(point);
    if (!cropEditing.value) return out;
    relativeRotation
      .copy(committedRotation)
      .invert()
      .premultiply(draftRotation);
    if (relativeRotation.angleTo(IDENTITY) <= ROTATION_EPSILON) return out;
    return out
      .sub(draftPivot)
      .applyQuaternion(relativeRotation)
      .add(draftPivot);
  }

  function project(point: THREE.Vector3): {
    x: number;
    y: number;
    inFront: boolean;
  } {
    if (!camera || !renderer) return { x: 0, y: 0, inFront: false };
    const canvas = renderer.domElement;
    // Transform from model-local to current world space so markers track the rotating model
    const worldPoint = toDraftSpace(point);
    if (currentModel) currentModel.localToWorld(worldPoint);
    const ndc = worldPoint.project(camera);
    const inFront = ndc.z < 1;
    const x = (ndc.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-ndc.y * 0.5 + 0.5) * canvas.clientHeight;
    return { x, y, inFront };
  }

  function onPointerDown(e: PointerEvent) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    // The gizmo gets first refusal: a press that lands on a handle is a crop
    // drag and nothing else. It declines anything that misses, so pressing
    // elsewhere still orbits the scan while the box is open.
    if (gizmo?.onPointerDown(e)) {
      // Captured so the drag keeps tracking once the pointer leaves the
      // viewer, which a big rotation on a small screen soon does. Moves are
      // listened for on the canvas, so without this they simply stop.
      (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
      return;
    }
    if (mode.value === "orbit") {
      // Drag start is discrete and rare, so skip the throttle here.
      reanchorOrbitTarget(true);
    }
    if (mode.value !== "pov") return;
    if (tweenActive) return;
    if (activePointers.size === 2) {
      // A second finger landed, so switch from drag to pinch.
      povState.dragging = false;
      pinchStartDist = getPinchDist();
      pinchStartFov = povState.fov;
    } else {
      povState.dragging = true;
      povState.lastX = e.clientX;
      povState.lastY = e.clientY;
    }
  }

  function onPointerMove(e: PointerEvent) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gizmo?.onPointerMove(e)) return;
    if (mode.value !== "pov" || !camera || tweenActive) return;
    if (activePointers.size >= 2) {
      // Pinching adjusts the field of view.
      const dist = getPinchDist();
      if (pinchStartDist > 0) {
        povState.fov = Math.max(
          30,
          Math.min(110, pinchStartFov * (pinchStartDist / dist)),
        );
        camera.fov = povState.fov;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (!povState.dragging) return;
    const dx = e.clientX - povState.lastX;
    const dy = e.clientY - povState.lastY;
    povState.rotationY += dx * 0.005;
    povState.rotationX += dy * 0.005;
    applyPovRotation();
    povState.lastX = e.clientX;
    povState.lastY = e.clientY;
  }

  function onPointerUp(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    const wasCropDrag = gizmo?.onPointerUp() ?? false;
    const dx = Math.abs(e.clientX - pointerDownX);
    const dy = Math.abs(e.clientY - pointerDownY);
    const isClick = dx < 5 && dy < 5;

    if (wasCropDrag) return;

    if (createMode.value && isClick && !tweenActive) {
      const pt = pickPoint(e.clientX, e.clientY);
      if (pt && onPickPoint) {
        onPickPoint(pt, getCameraSnapshot());
      }
    }

    povState.dragging = false;
  }

  function onPointerCancel(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    povState.dragging = false;
  }

  function onWheel(e: WheelEvent) {
    if (!camera) return;
    if (mode.value === "orbit") {
      reanchorOrbitTarget();
      return;
    }
    if (mode.value !== "pov") return;
    e.preventDefault();
    povState.fov = Math.max(30, Math.min(110, povState.fov + e.deltaY * 0.05));
    camera.fov = povState.fov;
    camera.updateProjectionMatrix();
  }

  function disposeMaterial(material: THREE.Material) {
    // material.dispose() does NOT cascade to textures, so they are released
    // manually. Skipping this leaves photogrammetry-sized textures resident
    // on the GPU after a model swap, which tanks interactive perf.
    for (const key of Object.keys(material)) {
      const value = (material as unknown as Record<string, unknown>)[key];
      if (
        value &&
        typeof value === "object" &&
        (value as { isTexture?: boolean }).isTexture
      ) {
        (value as THREE.Texture).dispose();
      }
    }
    material.dispose();
  }

  function disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach(disposeMaterial);
        else if (mat) disposeMaterial(mat);
      }
    });
  }

  function dispose() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(tweenRaf);
    if (currentModel) disposeObject(currentModel);
    gizmo?.dispose();
    controls?.dispose();
    renderer?.dispose();
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    currentModel = null;
    gizmo = null;
  }

  watch(
    canvasRef,
    (canvas) => {
      if (!canvas || scene) return;
      init(canvas);
      if (modelUrl.value) loadModel(modelUrl.value);
    },
    { immediate: true, flush: "post" },
  );

  watch(modelUrl, (url) => {
    // A different scan means any crop edit in progress is about the previous
    // one, so it goes rather than being carried across.
    if (cropEditing.value) cancelCrop();
    if (url && scene) loadModel(url);
  });

  onBeforeUnmount(() => dispose());

  return {
    loading,
    error,
    mode,
    createMode,
    markersVisible,
    cropEditing,
    cropReady,
    cropTool,
    rotateDegrees,
    cropMode,
    cropDraft,
    cropEmptiesScan,
    loadModel,
    setMode,
    pickPoint,
    getCameraSnapshot,
    flyTo,
    project,
    captureThumb,
    startCrop,
    cancelCrop,
    resetCropBox,
    setCropMode,
    setCropTool,
    cropHasChanges,
    toDraftSpace,
    pendingCrop,
    applyPendingCrop,
  };
}
