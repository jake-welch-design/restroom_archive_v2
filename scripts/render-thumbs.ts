// Render 800×800 JPG thumbnails for restroom GLBs using a headless Chromium +
// three.js, then upload to the restroom-archive-thumbs R2 bucket.
//
// Prerequisites:
//   wrangler r2 bucket create restroom-archive-thumbs   (once)
//
// Usage:
//   npx tsx scripts/render-thumbs.ts --all              # all published rows
//   npx tsx scripts/render-thumbs.ts --slug <slug>      # single row
//
import puppeteer from "puppeteer";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import net from "node:net";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const allFlag = argv.includes("--all");
const slugIdx = argv.indexOf("--slug");
const targetSlug = slugIdx >= 0 ? argv[slugIdx + 1] : null;

if (!allFlag && !targetSlug) {
  console.error(
    "Usage: npx tsx scripts/render-thumbs.ts --all | --slug <slug>",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Wrangler helpers
// ---------------------------------------------------------------------------
// D1 returns the columns as they are named in SQL, so these stay snake_case
// rather than going through shared/utils/crop.ts's camelCase reader.
type DbRow = {
  id: number;
  slug: string;
  file: string;
  crop_min_x: number | null;
  crop_min_y: number | null;
  crop_min_z: number | null;
  crop_max_x: number | null;
  crop_max_y: number | null;
  crop_max_z: number | null;
};

type Crop = { min: [number, number, number]; max: [number, number, number] };

/**
 * The row's crop box, or null when it has none.
 *
 * Without this the script would re-render every cropped entry at its full
 * bounds and quietly undo the framing an admin had corrected in the viewer.
 */
function cropOf(row: DbRow): Crop | null {
  if (
    row.crop_min_x == null ||
    row.crop_min_y == null ||
    row.crop_min_z == null ||
    row.crop_max_x == null ||
    row.crop_max_y == null ||
    row.crop_max_z == null
  )
    return null;
  return {
    min: [row.crop_min_x, row.crop_min_y, row.crop_min_z],
    max: [row.crop_max_x, row.crop_max_y, row.crop_max_z],
  };
}

const CROP_COLUMNS =
  "crop_min_x, crop_min_y, crop_min_z, crop_max_x, crop_max_y, crop_max_z";

function d1Query(sql: string): DbRow[] {
  const out = execSync(
    `npx wrangler d1 execute restroom-archive-db --remote --json --command ${JSON.stringify(sql)}`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
  return (JSON.parse(out)[0]?.results ?? []) as DbRow[];
}

function fetchRows(): DbRow[] {
  if (targetSlug) {
    return d1Query(
      `SELECT id, slug, file, ${CROP_COLUMNS} FROM restrooms WHERE slug='${targetSlug}'`,
    );
  }
  return d1Query(
    `SELECT id, slug, file, ${CROP_COLUMNS} FROM restrooms WHERE status='published' ORDER BY iso_date ASC`,
  );
}

function downloadGlb(fileKey: string, destPath: string) {
  execSync(
    `npx wrangler r2 object get "restroom-models/${fileKey}" --file ${JSON.stringify(destPath)} --remote`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
}

function uploadThumb(slug: string, imgPath: string) {
  execSync(
    `npx wrangler r2 object put "restroom-archive-thumbs/${slug}.jpg" --file ${JSON.stringify(imgPath)} --content-type image/jpeg --remote`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
}

function updateThumbKey(slug: string) {
  d1Query(`UPDATE restrooms SET thumb_key='${slug}.jpg' WHERE slug='${slug}'`);
}

// ---------------------------------------------------------------------------
// Local HTTP server. Serves the viewer HTML and the GLB from a temp directory.
// ---------------------------------------------------------------------------
function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

const viewerHtml = (crop: Crop | null) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;width:800px;height:800px;overflow:hidden;background:#000}
  canvas{display:block;width:800px;height:800px}
</style>
</head>
<body>
<canvas id="c" width="800" height="800"></canvas>
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(1)
renderer.setSize(800, 800)
renderer.setClearColor(0x000000)
renderer.toneMapping = THREE.NoToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.localClippingEnabled = true

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 1000)

// The admin's crop box for this entry, in the GLB's own local space, or null.
// The model is never rotated here, so the planes are built once from it rather
// than refreshed per frame the way the live viewer has to.
const CROP = ${crop ? JSON.stringify(crop) : "null"}
const clipPlanes = CROP
  ? [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -CROP.min[0]),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), CROP.max[0]),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -CROP.min[1]),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), CROP.max[1]),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -CROP.min[2]),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), CROP.max[2]),
    ]
  : null

// Unlit, matching the site viewer (composables/useThreeScene.ts): scans have
// their lighting baked into the base color texture, so no lights or environment.
function toUnlit(src) {
  const flat = new THREE.MeshBasicMaterial({
    name: src.name,
    map: src.map ?? null,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    vertexColors: src.vertexColors ?? false,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaMap: src.alphaMap ?? null,
    alphaTest: src.alphaTest,
    side: src.side,
    depthWrite: src.depthWrite,
    toneMapped: false,
    clippingPlanes: clipPlanes ?? undefined,
  })
  src.dispose()
  return flat
}

// Draco-compressed scans need a decoder here too, or this page renders an empty
// scene and publishes a blank thumbnail -- a quieter failure than the viewer's,
// which at least says "No DRACOLoader instance provided." The decoder comes from
// the same pinned jsDelivr copy of three as the importmap above, rather than the
// site's own public/draco/, because this page is served by a throwaway local
// server that knows only about "/" and "/model.glb".
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/draco/gltf/')

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)

loader.load('/model.glb', (gltf) => {
  const model = gltf.scene
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return
    child.material = Array.isArray(child.material)
      ? child.material.map(toUnlit)
      : toUnlit(child.material)
  })
  scene.add(model)

  // The crop box stands in for the measured one, exactly as the live viewer
  // does (composables/useThreeScene.ts): the centre, the camera distance and
  // the near/far planes all come off whichever box is in force.
  const box = CROP
    ? new THREE.Box3(
        new THREE.Vector3(...CROP.min),
        new THREE.Vector3(...CROP.max),
      )
    : new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  model.position.sub(center)

  // Clipping planes are world-space while the crop is defined against the
  // geometry, so they have to follow the model's offset. Applied once because
  // nothing moves the model after this point.
  if (clipPlanes) {
    model.updateMatrixWorld(true)
    for (const plane of clipPlanes) plane.applyMatrix4(model.matrixWorld)
  }

  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const fovRad = (70 * Math.PI) / 180
  const dist = (maxDim / 2) / Math.tan(fovRad / 2) * 1.4
  camera.position.set(dist * 0.7, dist * 0.5, dist * 0.8)
  camera.near = Math.max(dist / 1000, 0.01)
  camera.far = dist * 100
  camera.updateProjectionMatrix()
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)
  window.__ready = true
}, undefined, (err) => {
  console.error('GLB load error', err)
  window.__ready = true
})
</script>
</body>
</html>`;

function startServer(
  glbPath: string,
  port: number,
  crop: Crop | null,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(viewerHtml(crop));
    } else if (req.url === "/model.glb") {
      const data = readFileSync(glbPath);
      res.writeHead(200, {
        "Content-Type": "model/gltf-binary",
        "Content-Length": data.length,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}

// ---------------------------------------------------------------------------
// Render one thumbnail
// ---------------------------------------------------------------------------
async function renderThumb(row: DbRow) {
  const tmpDir = mkdtempSync(join(tmpdir(), "restroom-thumb-"));
  const glbPath = join(tmpDir, "model.glb");
  const imgPath = join(tmpDir, "thumb.jpg");

  try {
    process.stdout.write(`  [${row.slug}] downloading GLB… `);
    downloadGlb(row.file, glbPath);
    console.log("done");

    const port = await getFreePort();
    const server = startServer(glbPath, port, cropOf(row));

    process.stdout.write(`  [${row.slug}] rendering… `);
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 800 });
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    await page.waitForFunction("window.__ready === true", { timeout: 30000 });

    await page.screenshot({
      path: imgPath as `${string}.jpg`,
      type: "jpeg",
      quality: 85,
      clip: { x: 0, y: 0, width: 800, height: 800 },
    });
    await browser.close();
    server.close();
    console.log("done");

    process.stdout.write(`  [${row.slug}] uploading… `);
    uploadThumb(row.slug, imgPath);
    updateThumbKey(row.slug);
    console.log("done ✓");
  } finally {
    // Best-effort temp-file cleanup: a failure here must not mask the
    // outcome of the render itself.
    for (const path of [glbPath, imgPath]) {
      try {
        unlinkSync(path);
      } catch {
        // Already gone, or never written.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const rows = fetchRows();
  if (!rows.length) {
    console.log("No rows found.");
    return;
  }
  console.log(`Rendering thumbnails for ${rows.length} restroom(s)…\n`);
  for (const row of rows) {
    await renderThumb(row);
  }
  console.log("\nAll done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
