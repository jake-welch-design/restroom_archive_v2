import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Ref } from "vue";
import type { CameraMode } from "~/types/annotation";

export type ViewMode = "orbit" | "pov";

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

export function useThreeScene(
  canvasRef: Ref<HTMLCanvasElement | null>,
  modelUrl: Ref<string | null | undefined>,
  onPickPoint?: (point: THREE.Vector3, snapshot: CameraSnapshot) => void,
) {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const mode = ref<ViewMode>("orbit");
  const createMode = ref(false);
  const markersVisible = ref(true);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let currentModel: THREE.Group | null = null;
  let raf = 0;
  let resizeObserver: ResizeObserver | null = null;

  let userInteracted = false;
  let orbitDistance = 4;
  let loadId = 0;

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

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, 1, 0.01, 1000);
    camera.position.set(0, 0, 4);

    const ambient = new THREE.AmbientLight(0xffffff, 3);
    scene.add(ambient);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    controls.addEventListener("start", () => {
      userInteracted = true;
    });

    sizeToContainer(canvas);
    resizeObserver = new ResizeObserver(() => sizeToContainer(canvas));
    resizeObserver.observe(canvas.parentElement ?? canvas);

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
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    if (mode.value === "orbit" && controls) {
      if (!userInteracted && currentModel) {
        currentModel.rotation.y += 0.001;
      }
      // Skip controls.update() during flyTo — OrbitControls recomputes camera.position
      // from its internal spherical state each update, which overwrites tween values.
      if (!tweenActive) controls.update();
    }
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  async function loadModel(url: string) {
    if (!scene) return;
    loading.value = true;
    error.value = null;
    userInteracted = false;
    const myId = ++loadId;

    if (currentModel) {
      scene.remove(currentModel);
      disposeObject(currentModel);
      currentModel = null;
    }

    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      if (myId !== loadId) return;

      currentModel = gltf.scene;
      scene.add(currentModel);

      const box = new THREE.Box3().setFromObject(currentModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      currentModel.position.sub(center);

      if (camera && controls) {
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fovRad = (camera.fov * Math.PI) / 180;
        const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.4;
        orbitDistance = distance;

        camera.position.set(distance * 0.7, distance * 0.5, distance * 0.8);
        camera.near = Math.max(distance / 1000, 0.01);
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();
      }
    } catch (e) {
      if (myId === loadId)
        error.value = (e as Error).message ?? "Failed to load model";
    } finally {
      if (myId === loadId) loading.value = false;
    }
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
      camera.position.set(0, 0.2, 0);
      povState.rotationX = 0;
      povState.rotationY = 0;
      camera.rotation.set(0, 0, 0);
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
    const hits = raycaster.intersectObject(currentModel, true);
    if (hits.length === 0) return null;
    // Store in model-local space so the point tracks the model as it auto-rotates
    return currentModel.worldToLocal(hits[0].point.clone());
  }

  function getCameraSnapshot(): CameraSnapshot {
    const modelRotationY = currentModel?.rotation.y ?? 0;
    if (!camera) {
      return { cameraMode: "orbit", cameraFov: 70, modelRotationY };
    }
    if (mode.value === "orbit") {
      const target = controls?.target ?? new THREE.Vector3();
      return {
        cameraMode: "orbit",
        cameraFov: camera.fov,
        modelRotationY,
        orbitPosX: camera.position.x,
        orbitPosY: camera.position.y,
        orbitPosZ: camera.position.z,
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
        camera.position.set(0, 0.2, 0);
        povState.rotationX = snapshot.rotationX ?? 0;
        povState.rotationY = snapshot.rotationY ?? 0;
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
      targetFov = snapshot.cameraFov;
    } else {
      targetPos = new THREE.Vector3(0, 0.2, 0);
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
      }

      if (snapshot.cameraMode === "pov") {
        povState.rotationX = startRotX + (targetRotX - startRotX) * e;
        povState.rotationY = startRotY + (targetRotY - startRotY) * e;
        camera.rotation.order = "YXZ";
        camera.rotation.y = povState.rotationY;
        camera.rotation.x = povState.rotationX;
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

      const thumbCam = new THREE.PerspectiveCamera(70, 1, 0.01, 1000);
      const box = new THREE.Box3().setFromObject(currentModel);
      const size = box.getSize(new THREE.Vector3());
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
      offRenderer.render(scene, thumbCam);
      const dataUrl = offCanvas.toDataURL("image/jpeg", 0.85);
      currentModel.rotation.y = savedRotY;
      return dataUrl;
    } finally {
      offRenderer?.dispose();
    }
  }

  function project(point: THREE.Vector3): {
    x: number;
    y: number;
    inFront: boolean;
  } {
    if (!camera || !renderer) return { x: 0, y: 0, inFront: false };
    const canvas = renderer.domElement;
    // Transform from model-local to current world space so markers track the rotating model
    const worldPoint = point.clone();
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
    if (mode.value !== "pov") return;
    if (tweenActive) return;
    if (activePointers.size === 2) {
      // Second finger landed — switch from drag to pinch
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
    if (mode.value !== "pov" || !camera || tweenActive) return;
    if (activePointers.size >= 2) {
      // Pinch — adjust FOV
      const dist = getPinchDist();
      if (pinchStartDist > 0) {
        povState.fov = Math.max(30, Math.min(110, pinchStartFov * (pinchStartDist / dist)));
        camera.fov = povState.fov;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (!povState.dragging) return;
    const dx = e.clientX - povState.lastX;
    const dy = e.clientY - povState.lastY;
    povState.rotationY -= dx * 0.005;
    povState.rotationX -= dy * 0.005;
    povState.rotationX = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, povState.rotationX),
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = povState.rotationY;
    camera.rotation.x = povState.rotationX;
    povState.lastX = e.clientX;
    povState.lastY = e.clientY;
  }

  function onPointerUp(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    const dx = Math.abs(e.clientX - pointerDownX);
    const dy = Math.abs(e.clientY - pointerDownY);
    const isClick = dx < 5 && dy < 5;

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
    if (mode.value !== "pov" || !camera) return;
    e.preventDefault();
    povState.fov = Math.max(30, Math.min(110, povState.fov + e.deltaY * 0.05));
    camera.fov = povState.fov;
    camera.updateProjectionMatrix();
  }

  function disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }

  function dispose() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(tweenRaf);
    resizeObserver?.disconnect();
    if (currentModel) disposeObject(currentModel);
    controls?.dispose();
    renderer?.dispose();
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    currentModel = null;
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
    if (url && scene) loadModel(url);
  });

  onBeforeUnmount(() => dispose());

  return {
    loading,
    error,
    mode,
    createMode,
    markersVisible,
    loadModel,
    setMode,
    pickPoint,
    getCameraSnapshot,
    flyTo,
    project,
    captureThumb,
  };
}
