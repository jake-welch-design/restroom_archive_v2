import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Crop, CropBox } from "~~/shared/utils/crop";
import { patchCropShader } from "~~/shared/utils/cropShader";

/**
 * How a scan is turned into something on screen, shared by every in-app
 * renderer: the viewer (useThreeScene.ts) and the video studio
 * (useTurntableStage.ts).
 *
 * Lifted out of the viewer so the studio cannot drift from it. The thumbnail
 * script is the cautionary tale: it carried its own copy of the loader and
 * materials and missed both the env-map fix and Draco. Only the parts that are
 * the same in both live here: decoding, the unlit material, measuring and
 * disposing, and reading a stored crop. Everything to do with editing a crop
 * stays in the viewer, which is the only renderer that edits one.
 */

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
 * caches the compiled decoder on the instance. Callers build a fresh
 * `GLTFLoader` for every model, so a decoder built alongside it would start a
 * new worker per scan viewed and leave the old ones running. One instance for
 * the viewer and the studio both, for the same reason.
 *
 * Built lazily rather than at module scope: this module is imported during SSR
 * even though the scene itself is client-only, and construction should not
 * happen on the server.
 */
let dracoLoader: DRACOLoader | null = null;

export function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    // Served from public/draco/ -- same-origin, so it satisfies
    // `connect-src 'self'` without a CSP exception. See public/draco/README.md.
    dracoLoader.setDecoderPath("/draco/");
  }
  return dracoLoader;
}

/**
 * What a scan's materials read from the renderer that owns them.
 *
 * Getters rather than values because the material is built once and compiled
 * later, possibly more than once: the crop shader's shape is decided at compile
 * time, from whatever the owner holds then.
 */
export interface ScanShading {
  /** One object shared by every material on the scan; see shared/utils/cropShader.ts. */
  uniforms: Record<string, THREE.IUniform>;
  keepActive(): boolean;
  removalCount(): number;
  /** Changes whenever the two above do, so three rebuilds the program. */
  cacheKey(): string;
  /** The viewer's crop-tool planes. The studio never edits, so has none. */
  clippingPlanes?(): THREE.Plane[] | undefined;
  clipIntersection?(): boolean;
}

// Scans are photographed, not lit: the base color texture already contains the
// real-world lighting. Rendering them with a PBR material means three re-lights
// an already-lit image: dark surfaces pick up ambient and environment fill, and the
// whole model reads faded. MeshBasicMaterial shows the texture exactly as
// authored, and sidesteps the metallicFactor-defaults-to-1 black-model problem
// entirely since metalness/roughness no longer participate.
export function toUnlitMaterial(
  src: THREE.Material,
  shading: ScanShading,
): THREE.MeshBasicMaterial {
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
    clipIntersection: shading.clipIntersection?.() ?? false,
  });
  // Left unset rather than given six inert planes on an uncropped scan.
  // The number of clipping planes is part of the shader's cache key, so
  // handing every model a full set would cost a per-fragment test on scans
  // that have nothing to clip. Assigned after construction because three
  // warns about any constructor option passed as undefined.
  const planes = shading.clippingPlanes?.();
  if (planes) flat.clippingPlanes = planes;
  // The confirmed rounds and the crop in force; see shared/utils/cropShader.ts.
  flat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shading.uniforms);
    patchCropShader(shader, shading.keepActive(), shading.removalCount());
  };
  flat.customProgramCacheKey = () => shading.cacheKey();
  // Textures are handed to the new material, so only the material shell is
  // released here, since disposeMaterial() would take the maps down with it.
  src.dispose();
  return flat;
}

export function applyFlatMaterials(root: THREE.Object3D, shading: ScanShading) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => toUnlitMaterial(m, shading))
      : toUnlitMaterial(mesh.material, shading);
  });
}

/**
 * A scan's bounds in `model`'s own local space, optionally leaving out
 * whatever lies inside `exclude`.
 *
 * `precise` walks every vertex rather than transforming each mesh's bounding
 * box. For an unturned scan the two agree, and the bounding boxes are far
 * cheaper. For a turned one the transformed box of a mesh is looser than the
 * mesh, by up to the square root of two at forty-five degrees, which would
 * frame a levelled scan from further back than it needs.
 */
export function measureScanBounds(
  model: THREE.Object3D | null,
  options: { exclude?: THREE.Box3[]; precise?: boolean } = {},
): THREE.Box3 {
  const { exclude = [], precise = false } = options;
  const result = new THREE.Box3().makeEmpty();
  if (!model) return result;

  model.updateMatrixWorld(true);
  const modelInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const toModel = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  const meshBox = new THREE.Box3();

  model.traverse((child) => {
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
    // Only the boxes that reach this mesh can take anything from it.
    const near = exclude.filter((box) => meshBox.intersectsBox(box));
    if (!precise && !near.length) {
      result.union(meshBox);
      return;
    }

    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(toModel);
      if (!near.some((box) => box.containsPoint(vertex)))
        result.expandByPoint(vertex);
    }
  });

  return result;
}

export function boxFromCrop(crop: CropBox): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(crop.minX, crop.minY, crop.minZ),
    new THREE.Vector3(crop.maxX, crop.maxY, crop.maxZ),
  );
}

/**
 * Whether a box is the scan's own bounds, to within a millimetre an admin
 * could not have aimed for. That case is stored as no crop at all rather than
 * as a box that happens to match, so Reset genuinely clears the columns.
 */
export function isFullBounds(box: THREE.Box3, bounds: THREE.Box3): boolean {
  const epsilon = 1e-3;
  return (
    box.min.distanceTo(bounds.min) < epsilon &&
    box.max.distanceTo(bounds.max) < epsilon
  );
}

/**
 * A stored crop as rounds: the box it keeps, or null for the whole scan, and
 * the boxes it removes, oldest first.
 *
 * A crop saved only to move the POV eye keeps a `keep` box at the scan's full
 * bounds, which hides nothing. Reading that as null keeps the scan off the
 * crop shader, which every fragment would otherwise pay for.
 */
export function cropRounds(
  crop: Crop | null,
  bounds: THREE.Box3,
): { keep: THREE.Box3 | null; removals: THREE.Box3[] } {
  if (!crop) return { keep: null, removals: [] };
  const removals = (crop.removed ?? []).map(boxFromCrop);
  if (crop.mode === "remove")
    return { keep: null, removals: [...removals, boxFromCrop(crop.box)] };
  const keep = boxFromCrop(crop.box);
  return { keep: isFullBounds(keep, bounds) ? null : keep, removals };
}

/** The level node's rotation and offset for a stored crop's levelling. */
export function applyStoredLevel(levelNode: THREE.Object3D, crop: Crop | null) {
  const level = crop?.level;
  if (!level) return;
  const { rotation: r, pivot: p } = level;
  const rotation = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  const pivot = new THREE.Vector3(p.x, p.y, p.z);
  levelNode.quaternion.copy(rotation);
  levelNode.position.copy(pivot).sub(pivot.clone().applyQuaternion(rotation));
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

export function disposeObject(obj: THREE.Object3D) {
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
