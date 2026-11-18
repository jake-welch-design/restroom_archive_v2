import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Crop } from "~~/shared/utils/crop";
import {
  applyFlatMaterials,
  applyStoredLevel,
  boxFromCrop,
  cropRounds,
  disposeObject,
  getDracoLoader,
  measureScanBounds,
  type ScanShading,
} from "~/composables/scanModel";

/**
 * The video studio's renderer: one scan, one camera, drawn a frame at a time.
 *
 * Frame-stepped rather than animated. The caller asks for a turn between 0 and
 * 1 and gets that exact frame, which is what lets the exporter encode a
 * rotation with no dropped frames, faster than real time, ending exactly where
 * it began so the clip loops. The live preview is the same call driven by
 * requestAnimationFrame, so what the preview shows is what gets encoded.
 *
 * Everything lands on one 2D canvas: the WebGL frame first, then the caption
 * drawn over it. The caption has to be drawn into the frame because the encoder
 * only sees the canvas; the viewer's caption is HTML laid over its canvas,
 * which a recording would not pick up.
 */

export type StudioAspect =
  "9:16" | "2:3" | "4:5" | "1:1" | "5:4" | "3:2" | "16:9";
export type StudioOrientation = "portrait" | "landscape";
export type StudioView =
  "front" | "three-quarter" | "high" | "top-down" | "inside";

export const STUDIO_ASPECTS: Record<
  StudioAspect,
  { width: number; height: number; label: string; hint: string }
> = {
  "9:16": {
    width: 1080,
    height: 1920,
    label: "9:16",
    hint: "Stories, Highlights, Reels",
  },
  "2:3": { width: 1080, height: 1620, label: "2:3", hint: "Portrait photo" },
  "4:5": { width: 1080, height: 1350, label: "4:5", hint: "Feed, portrait" },
  "1:1": { width: 1080, height: 1080, label: "1:1", hint: "Feed, square" },
  "5:4": { width: 1350, height: 1080, label: "5:4", hint: "Feed, landscape" },
  "3:2": {
    width: 1620,
    height: 1080,
    label: "3:2",
    hint: "Newsletter, landscape photo",
  },
  "16:9": {
    width: 1920,
    height: 1080,
    label: "16:9",
    hint: "Widescreen",
  },
};

/**
 * The ratios each orientation offers, in matching order, so turning the
 * orientation over turns the chosen ratio over with it. Square is in both.
 */
export const STUDIO_RATIOS: Record<StudioOrientation, StudioAspect[]> = {
  portrait: ["9:16", "2:3", "4:5", "1:1"],
  landscape: ["16:9", "3:2", "5:4", "1:1"],
};

/**
 * The camera angles, as an elevation above the horizon. `inside` stands at the
 * POV eye and turns on the spot instead of orbiting.
 */
export const STUDIO_VIEWS: {
  id: StudioView;
  label: string;
  elevation: number;
}[] = [
  { id: "front", label: "Front", elevation: 5 },
  // The angle the viewer opens on: its camera sits at (0.7, 0.5, 0.8).
  { id: "three-quarter", label: "¾", elevation: 25 },
  { id: "high", label: "High", elevation: 50 },
  { id: "top-down", label: "Top-down", elevation: 90 },
  { id: "inside", label: "Inside", elevation: 0 },
];

export interface StudioCaption {
  name: string;
  date: string;
  location: string;
  /** Text size, in pixels of the 900px viewport a frame stands for. */
  size: number;
}

export interface StudioFrame {
  aspect: StudioAspect;
  view: StudioView;
  /**
   * 1 fits a reference room (REFERENCE_ROOM), turning, inside the frame, so
   * every scan is drawn at the same scale. Higher is closer.
   */
  zoom: number;
  /** Degrees. Which way the scan faces on the first and last frame. */
  startAngle: number;
  caption: StudioCaption | null;
}

/** The rate the scan route answers a burst with; the exporter waits it out. */
export class RateLimitedError extends Error {
  constructor() {
    super("Rate limited");
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** A longer lens than the viewer's 70°, which suits a turntable. */
const ORBIT_FOV = 45;
/** The viewer's POV field of view, which `zoom` narrows for Inside. */
const POV_FOV = 80;
/** How far above the frame's centre POV stands by default; as in the viewer. */
const DEFAULT_POV_RISE = 0.2;
/**
 * The room that zoom 1 fits, in metres. The camera is placed for this rather
 * than for each scan's own bounds, so at the same zoom a metre is the same
 * size on screen in every clip: a cubicle reads as small beside a hall, as it
 * is. A scan larger than this overflows at 100% and needs a lower zoom.
 */
const REFERENCE_ROOM = { width: 4, depth: 4, height: 2.7 };

/**
 * The full-screen viewer's caption (layouts/default.vue: `.bottom-nav-info` and
 * `.bottom-gradient`), as measured in the browser, in CSS pixels. The site draws
 * these at a fixed size whatever the window, so the frame has to stand in for
 * some window for them to mean anything: every frame is treated as a full-screen
 * viewport this tall, and everything scales by frame height over it. The caption
 * then fills the same share of the frame as it does on a laptop screen, in
 * every format.
 */
const VIEWPORT_HEIGHT = 900;
/** Arial's line box at `line-height: normal`, as a multiple of its font size. */
const CAPTION_LINE = 16 / 14;
/** How far a baseline sits above the bottom of that box, as the same multiple. */
const CAPTION_DESCENT = 3 / 14;
/** The caption box's bottom edge above the frame's. */
const CAPTION_BOTTOM = 10;
/** As far in from each edge as `.bottom-nav-info`'s phone max-width allows. */
const CAPTION_INSET = 40;
const GRADIENT_HEIGHT = 150;

export function createTurntableStage(output: HTMLCanvasElement) {
  const glCanvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    // Read back by drawImage after the render, in the same task, so this is
    // belt and braces; it also keeps the frame readable for a paused preview.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  // As in the viewer: scans carry their lighting in the texture, so no tone
  // mapping, which would wash them out.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The viewer's stage colour.
  renderer.setClearColor(0x000000);

  const ctx = output.getContext("2d")!;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(ORBIT_FOV, 1, 0.01, 1000);
  camera.rotation.order = "YXZ";

  let model: THREE.Group | null = null;
  /** The frame box's centre, which the model is pinned on as it turns. */
  const centre = new THREE.Vector3();
  const frameSize = new THREE.Vector3();
  /** Where Inside stands, relative to `centre`. */
  const eye = new THREE.Vector3();
  let loadId = 0;

  /* --- Crop shader, read-only ---------------------------------------------- */
  const keepBox = new THREE.Box3();
  let keepActive = false;
  let removals: THREE.Box3[] = [];
  const uniforms = {
    cropToLocal: { value: new THREE.Matrix4() },
    cropKeepMin: { value: keepBox.min },
    cropKeepMax: { value: keepBox.max },
    cropRemoveMin: { value: [] as THREE.Vector3[] },
    cropRemoveMax: { value: [] as THREE.Vector3[] },
  };
  const shading: ScanShading = {
    uniforms,
    keepActive: () => keepActive,
    removalCount: () => removals.length,
    cacheKey: () => `${keepActive ? 1 : 0}:${removals.length}`,
  };

  async function fetchScan(url: string, signal?: AbortSignal) {
    const res = await fetch(url, { signal });
    if (res.status === 429) throw new RateLimitedError();
    if (!res.ok) throw new Error(`Scan request failed (${res.status})`);
    return res.arrayBuffer();
  }

  /**
   * Loads a scan and applies its stored crop, as the viewer does on open.
   * Resolves false when a later load overtook this one.
   */
  async function load(
    url: string,
    crop: Crop | null,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const myId = ++loadId;
    const data = await fetchScan(url, signal);
    if (myId !== loadId) return false;

    const loader = new GLTFLoader();
    loader.setDRACOLoader(getDracoLoader());
    const gltf = await loader.parseAsync(data, "");
    if (myId !== loadId) {
      disposeObject(gltf.scene);
      return false;
    }

    unload();
    const next = new THREE.Group();
    const levelNode = new THREE.Group();
    levelNode.add(gltf.scene);
    next.add(levelNode);
    applyStoredLevel(levelNode, crop);

    const bounds = measureScanBounds(next);
    const rounds = cropRounds(crop, bounds);
    keepActive = rounds.keep !== null;
    if (rounds.keep) keepBox.copy(rounds.keep);
    removals = rounds.removals;
    uniforms.cropRemoveMin.value = removals.map((box) => box.min);
    uniforms.cropRemoveMax.value = removals.map((box) => box.max);
    applyFlatMaterials(next, shading);

    // The frame box, not the drawn one: in `remove` mode the drawn box is the
    // part that is gone.
    const frame = crop ? boxFromCrop(crop.frame) : bounds;
    frame.getCenter(centre);
    frame.getSize(frameSize);

    const { povX, povY, povZ } = crop ?? {};
    eye.set(0, povY == null ? DEFAULT_POV_RISE : povY - centre.y, 0);
    if (povX != null && povZ != null) {
      eye.x = povX - centre.x;
      eye.z = povZ - centre.z;
    }

    model = next;
    scene.add(model);
    return true;
  }

  function unload() {
    if (!model) return;
    scene.remove(model);
    disposeObject(model);
    model = null;
  }

  /** Turns the model by `theta` about the frame's centre, as pinCentre does. */
  function turnModel(theta: number) {
    if (!model) return;
    model.rotation.y = theta;
    model.position.copy(centre).applyAxisAngle(Y_AXIS, theta).negate();
    model.updateMatrixWorld(true);
    uniforms.cropToLocal.value.copy(model.matrixWorld).invert();
  }

  /**
   * Stands the camera back far enough that the reference room, turning, never
   * leaves the frame at zoom 1. The distance depends only on the view, the
   * aspect and the zoom, never on the scan, which is what keeps every scan at
   * one scale.
   *
   * Turning sweeps the scan through a cylinder about Y, so it is the cylinder
   * that is fitted: its radius across, and its height plus the tilt of its top
   * and bottom discs up and down. Tighter than fitting a sphere, which would
   * leave a typical room small in a tall frame.
   */
  function placeOrbitCamera(
    elevationDeg: number,
    zoom: number,
    aspect: number,
  ) {
    const e = THREE.MathUtils.degToRad(elevationDeg);
    const radius = Math.hypot(REFERENCE_ROOM.width, REFERENCE_ROOM.depth) / 2;
    const halfHeight = REFERENCE_ROOM.height / 2;
    const halfAcross = radius;
    const halfUp = halfHeight * Math.cos(e) + radius * Math.sin(e);
    const depth = radius * Math.cos(e) + halfHeight * Math.sin(e);

    const vHalf = THREE.MathUtils.degToRad(ORBIT_FOV) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const distance =
      (Math.max(halfUp / Math.tan(vHalf), halfAcross / Math.tan(hHalf)) +
        depth) /
      zoom;

    camera.fov = ORBIT_FOV;
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 100;
    // Straight down has no "up" in Y to look along, so the top of the frame
    // is pointed at −Z, the far side of the scan as it starts.
    camera.up.set(0, 1, 0);
    if (elevationDeg >= 90) camera.up.set(0, 0, -1);
    camera.position.set(0, Math.sin(e) * distance, Math.cos(e) * distance);
    camera.lookAt(0, 0, 0);
  }

  function placeInsideCamera(theta: number, zoom: number) {
    camera.up.set(0, 1, 0);
    camera.fov = THREE.MathUtils.clamp(POV_FOV / zoom, 20, 120);
    camera.near = 0.01;
    camera.far = Math.max(frameSize.length(), 1) * 100;
    camera.position.copy(eye);
    camera.rotation.set(0, theta, 0, "YXZ");
  }

  function drawCaption(caption: StudioCaption) {
    const { width, height } = output;
    const s = height / VIEWPORT_HEIGHT;

    // The viewer's bottom gradient: transparent to 20% black.
    const gradientTop = height - GRADIENT_HEIGHT * s;
    const gradient = ctx.createLinearGradient(0, gradientTop, 0, height);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.2)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, gradientTop, width, height - gradientTop);

    const fontSize = caption.size * s;
    const lineHeight = CAPTION_LINE * fontSize;
    // The last line's baseline: the box's bottom edge, raised by the descent.
    const baseline = height - CAPTION_BOTTOM * s - CAPTION_DESCENT * fontSize;
    const maxWidth = width - 2 * CAPTION_INSET * s;
    const lines = [caption.name, caption.date, caption.location].filter(
      Boolean,
    );

    ctx.save();
    // Plain white. The site's `mix-blend-mode: difference` reads as white over
    // the black stage, but over a scan it tints the text with whatever is
    // behind it, which a clip should not do.
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    lines.forEach((line, i) => {
      const y = baseline - (lines.length - 1 - i) * lineHeight;
      // A long name shrinks to fit rather than running off the frame.
      ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
      const measured = ctx.measureText(line).width;
      if (measured > maxWidth)
        ctx.font = `${(fontSize * maxWidth) / measured}px Arial, Helvetica, sans-serif`;
      ctx.fillText(line, width / 2, y);
    });
    ctx.restore();
  }

  /** Draws the frame `turn` of the way through one full rotation, 0 to 1. */
  function render(frame: StudioFrame, turn: number) {
    const { width, height } = STUDIO_ASPECTS[frame.aspect];
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    if (glCanvas.width !== width || glCanvas.height !== height)
      renderer.setSize(width, height, false);

    camera.aspect = width / height;

    const theta =
      THREE.MathUtils.degToRad(frame.startAngle) + turn * Math.PI * 2;
    if (frame.view === "inside") {
      turnModel(0);
      placeInsideCamera(theta, frame.zoom);
    } else {
      turnModel(theta);
      const view = STUDIO_VIEWS.find((v) => v.id === frame.view)!;
      placeOrbitCamera(view.elevation, frame.zoom, camera.aspect);
    }
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(glCanvas, 0, 0);
    if (frame.caption) drawCaption(frame.caption);
  }

  function dispose() {
    loadId++;
    unload();
    renderer.dispose();
  }

  return {
    load,
    render,
    unload,
    dispose,
    hasModel: () => model !== null,
  };
}

export type TurntableStage = ReturnType<typeof createTurntableStage>;
