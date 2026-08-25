<script setup lang="ts">
import maplibregl from "maplibre-gl";
import { escapeHtml } from "~~/shared/utils/html";
import type { RestroomSummary } from "~/types/restroom";

const props = defineProps<{
  rows: RestroomSummary[];
  selectedSlug: string | null;
  panelOpen: boolean;
}>();
const emit = defineEmits<{ select: [slug: string] }>();

const mapContainer = ref<HTMLDivElement | null>(null);

let map: maplibregl.Map | null = null;
let resizeObs: ResizeObserver | null = null;
let sourceReady = false;
let hoverPopup: maplibregl.Popup | null = null;
let needsInitialFit = false;
let initialPins: RestroomSummary[] = [];
// True while the camera still shows the position the app put it in; cleared as soon
// as the user pans/zooms themselves, so resize-driven re-centring doesn't fight
// them for control of the view.
let cameraOwned = true;
let recenterTimer: ReturnType<typeof setTimeout> | null = null;

// Pins the user has already opened, persisted so the "already looked at"
// state survives reloads. Viewed pins render dimmed + desaturated.
const VIEWED_KEY = "ra:viewedPins";
const viewedSlugs = new Set<string>();

// Basemap choice ("map" = CARTO light, "satellite" = Esri imagery), persisted
// so the map opens in whichever mode was last used.
const BASEMAP_KEY = "ra:basemap";
type Basemap = "map" | "satellite";
const basemap = ref<Basemap>("map");

function loadBasemap() {
  try {
    if (localStorage.getItem(BASEMAP_KEY) === "satellite")
      basemap.value = "satellite";
  } catch {
    // Ignore unavailable storage: the default basemap is fine.
  }
}

function saveBasemap() {
  try {
    localStorage.setItem(BASEMAP_KEY, basemap.value);
  } catch {
    // Ignore storage write failures (private mode / quota).
  }
}

function loadViewedSlugs() {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const s of arr) if (typeof s === "string") viewedSlugs.add(s);
    }
  } catch {
    // Ignore malformed or unavailable storage. Viewed state is best effort.
  }
}

function markViewed(slug: string) {
  if (viewedSlugs.has(slug)) return;
  viewedSlugs.add(slug);
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...viewedSlugs]));
  } catch {
    // Ignore storage write failures (private mode / quota).
  }
  updatePinData(props.rows);
}

function updatePinData(rows: RestroomSummary[]) {
  if (!map || !sourceReady) return;
  const pinned = rows.filter((r) => r.lat != null && r.lng != null);
  (map.getSource("restrooms") as maplibregl.GeoJSONSource).setData({
    type: "FeatureCollection",
    features: pinned.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.lng!, r.lat!] },
      properties: {
        slug: r.slug,
        name: r.name,
        date: r.date,
        viewed: viewedSlugs.has(r.slug),
      },
    })),
  });
  return pinned;
}

function fitView(pinned: RestroomSummary[]) {
  if (!map || !pinned.length) return;
  if (pinned.length === 1) {
    map.easeTo({ center: [pinned[0].lng!, pinned[0].lat!], zoom: 12 });
  } else {
    const bounds = new maplibregl.LngLatBounds();
    pinned.forEach((r) => bounds.extend([r.lng!, r.lat!]));
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 400 });
  }
}

// First camera placement after the map loads. The component is torn down and
// remounted every time the user leaves/returns to map view, so this also runs
// on each tab switch: if something is selected, land straight on its pin
// instead of fitting the whole set.
function initialCamera(pinned: RestroomSummary[]) {
  if (flyToSelected(props.selectedSlug, false)) return;
  fitView(pinned);
}

function initMap() {
  const el = mapContainer.value;
  if (!el || map) return;

  map = new maplibregl.Map({
    container: el,
    style: {
      version: 8,
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
          ],
          tileSize: 256,
          attribution:
            '© <a href="https://carto.com/attributions">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        },
        satellite: {
          type: "raster",
          tiles: [
            // Note the {y}/{x} order: Esri's REST tile scheme, not {x}/{y}.
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution:
            'Imagery © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
        },
      },
      // Both basemaps are declared up front and toggled by visibility. Swapping
      // via setStyle would tear down the `restrooms` source and pin layer on
      // every switch; this way only one layout property changes. Attribution
      // follows automatically, because MapLibre credits only sources whose layers are
      // visible.
      layers: [
        {
          id: "carto-layer",
          type: "raster",
          source: "carto",
          layout: { visibility: basemap.value === "map" ? "visible" : "none" },
          // Deliberate desaturation of the light basemap; imagery is left alone.
          paint: { "raster-saturation": -0.15 },
        },
        {
          id: "satellite-layer",
          type: "raster",
          source: "satellite",
          layout: {
            visibility: basemap.value === "satellite" ? "visible" : "none",
          },
        },
      ],
    },
    center: [-98, 38],
    zoom: 4,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
  });

  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.on("load", () => {
    if (!map) return;

    map.addSource("restrooms", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: "restroom-pins",
      type: "circle",
      source: "restrooms",
      paint: {
        "circle-radius": 5,
        "circle-color": "#ff0000",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
      },
    });

    map.on("click", "restroom-pins", (e) => {
      const slug = e.features?.[0]?.properties?.slug as string | undefined;
      if (!slug) return;
      markViewed(slug);
      emit("select", slug);
    });

    hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: "restroom-hover-popup",
    });

    map.on("mousemove", "restroom-pins", (e) => {
      if (!map || !hoverPopup) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const name = (f.properties?.name as string) ?? "";
      const date = (f.properties?.date as string) ?? "";
      const html = `<div class="hover-name">${escapeHtml(name)}</div>${
        date ? `<div class="hover-date">${escapeHtml(date)}</div>` : ""
      }`;
      hoverPopup.setLngLat([lng, lat]).setHTML(html).addTo(map);
    });

    map.on("mouseleave", "restroom-pins", () => {
      if (!map) return;
      map.getCanvas().style.cursor = "";
      hoverPopup?.remove();
    });

    sourceReady = true;
    const pinned = updatePinData(props.rows) ?? [];
    updateActivePin(props.selectedSlug);

    // If the container has real dimensions, place the camera now; otherwise
    // defer until the first resize when the flex layout resolves.
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      initialCamera(pinned);
    } else {
      needsInitialFit = true;
      initialPins = pinned;
    }

    map.resize();
  });

  // Track whether the camera is still showing the last position the app set. Once the
  // user pans or zooms by hand the view is theirs, and resize must not yank it
  // back to the selected pin.
  for (const ev of ["dragstart", "zoomstart", "rotatestart"] as const) {
    map.on(ev, (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) cameraOwned = false;
    });
  }

  // Resize the map whenever the container (or its parent) changes size.
  // This also handles the on-refresh case: the flex layout resolves after
  // mount, ResizeObserver fires, resize() corrects the canvas, and if the
  // initial fitView was deferred, it runs now.
  resizeObs = new ResizeObserver(() => {
    if (!map) return;
    map.resize();
    if (needsInitialFit && el.clientWidth > 0 && el.clientHeight > 0) {
      needsInitialFit = false;
      initialCamera(initialPins);
      return;
    }
    // resize() keeps the raw viewport centre, which is not the padded centre the
    // pin was placed at, so the pin drifts every time the container changes
    // size. On iOS Safari that is constant: the panel is sized in dvh and the
    // collapsing URL bar re-runs this on almost every scroll. Put the pin back.
    if (cameraOwned) scheduleRecenter();
  });
  resizeObs.observe(el);
  if (el.parentElement) resizeObs.observe(el.parentElement);
}

onMounted(() => {
  loadViewedSlugs();
  loadBasemap();
  nextTick(initMap);
});

// Data-only update on row changes. The camera is never moved, so a fly-to is never
// overridden by data refreshes (e.g. thumbnail auto-capture → refreshNuxtData).
watch(
  () => props.rows,
  (rows) => updatePinData(rows),
);

// Layout box of `el` relative to `ancestor`, walking the offsetParent chain.
// offset* is used rather than getBoundingClientRect because it ignores CSS
// transforms: the panel is mid slide-in when this runs, and its visual rect is
// still off-screen at that point.
function offsetBox(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== ancestor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return {
    left: x,
    top: y,
    right: x + el.offsetWidth,
    bottom: y + el.offsetHeight,
  };
}

// Camera padding that keeps the selected pin centred in the part of the map the
// info panel does not cover: a side sheet on mobile, a bottom sheet on desktop.
//
// This is measured from the rendered elements rather than derived from the CSS
// percentages. The old version multiplied `window.innerWidth` by the panel's
// 50%, which iOS Safari breaks: `innerWidth` there follows the *visual*
// viewport, so any pinch or auto-zoom (focusing the search field is enough)
// makes it disagree with the layout width the panel is actually sized against.
function getPanelPadding(): maplibregl.PaddingOptions {
  const zero = { top: 0, bottom: 0, left: 0, right: 0 };
  const el = mapContainer.value;
  if (!props.panelOpen || !el) return zero;

  // Fallback for when the panel can't be measured (not in the DOM yet, or a
  // browser that reports the offset chain differently): estimate from the CSS
  // the panel is laid out with. documentElement.clientWidth, not innerWidth,
  // on iOS the latter tracks the visual viewport and shrinks when Safari zooms.
  const estimate = (): maplibregl.PaddingOptions => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    return document.documentElement.clientWidth <= 750
      ? { ...zero, left: Math.round(w * 0.5) }
      : { ...zero, bottom: Math.round(h * 0.3333) };
  };

  const area = el.closest<HTMLElement>(".map-area");
  const panel = area?.querySelector<HTMLElement>(".map-panel");
  if (!area || !panel) return estimate();

  const m = offsetBox(el, area);
  const p = offsetBox(panel, area);
  // A zero-area panel box means the measurement didn't work here; estimate
  // rather than silently returning no padding and hiding the pin.
  if (panel.offsetWidth === 0 || panel.offsetHeight === 0) return estimate();
  // Leave the camera somewhere to work with if the panel ever covers nearly
  // everything (very short viewports).
  const cap = (v: number, extent: number) =>
    Math.max(0, Math.min(Math.round(v), Math.round(extent * 0.8)));

  // Side sheet: spans (near enough) the full height of the map, docked to one
  // side. Otherwise treat it as docked to the bottom.
  const measured: maplibregl.PaddingOptions =
    p.bottom - p.top >= (m.bottom - m.top) * 0.9
      ? p.left <= m.left
        ? { ...zero, left: cap(p.right - m.left, el.clientWidth) }
        : { ...zero, right: cap(m.right - p.left, el.clientWidth) }
      : { ...zero, bottom: cap(m.bottom - p.top, el.clientHeight) };

  // If the panel is open it covers something, so padding of 0 on every side means
  // the measurement went wrong, and using it would leave the pin under the panel.
  const total = measured.left + measured.right + measured.top + measured.bottom;
  return total > 0 ? measured : estimate();
}

// Returns whether the camera actually moved. Callers use that to fall back to
// a fit-all view when there's nothing selected (or it has no coordinates).
function flyToSelected(slug: string | null, animate = true) {
  if (!slug || !map || !sourceReady) return false;
  const row = props.rows.find((r) => r.slug === slug);
  if (row?.lng == null || row?.lat == null) return false;
  cameraOwned = true;
  const camera = {
    center: [row.lng, row.lat] as [number, number],
    zoom: 14,
    padding: getPanelPadding(),
  };
  // The `duration` key is omitted (not set to undefined) for the animated case:
  // MapLibre does `+options.duration` whenever the key is present, so passing
  // undefined yields NaN, and the animation then writes NaN into the transform's
  // zoom or centre, every later camera move throws and the map stops responding.
  // jumpTo isn't an option for the instant case: it sets the raw viewport centre
  // and ignores `padding`, which would drop the pin behind the info panel.
  map.flyTo(animate ? camera : { ...camera, duration: 0 });
  return true;
}

// Re-centre the selected pin at the current zoom. Used when the info panel
// opens or closes: the panel covers part of the map, so the pin has to shift to
// stay centred in whatever is still visible. Zoom is deliberately untouched:
// toggling a panel should pan, never zoom.
function recenterSelected(duration = 400) {
  if (!map || !sourceReady) return;
  const row = props.rows.find((r) => r.slug === props.selectedSlug);
  if (row?.lng == null || row?.lat == null) return;
  cameraOwned = true;
  map.easeTo({
    center: [row.lng, row.lat],
    padding: getPanelPadding(),
    duration,
  });
}

// Resize can fire many times in a row (iOS toolbar, orientation change, the
// flex layout settling), so coalesce and correct once it stops. The correction
// itself is instant, and an animation here would read as the map wobbling.
function scheduleRecenter() {
  if (recenterTimer) clearTimeout(recenterTimer);
  recenterTimer = setTimeout(() => {
    recenterTimer = null;
    recenterSelected(0);
  }, 120);
}

// Colour + opacity are property-driven so already-viewed pins read as dimmed
// and desaturated, while the currently selected pin stays highlighted at full
// strength. `selected` is a single slug, so it wins over the viewed state.
//
// Over satellite imagery the same values lose the fight against dark, busy
// ground: the muted "viewed" tint disappears entirely at 0.45. Imagery mode
// keeps the identical colour language but thickens the white ring and lifts the
// dimmed state to a level that still reads as "already looked at".
function updateActivePin(slug: string | null) {
  if (!map || !sourceReady) return;
  const sat = basemap.value === "satellite";
  const isSelected: maplibregl.ExpressionSpecification = slug
    ? ["==", ["get", "slug"], slug]
    : ["literal", false];

  map.setPaintProperty("restroom-pins", "circle-color", [
    "case",
    isSelected,
    "#ff8a8a",
    ["get", "viewed"],
    sat ? "#e8b0b0" : "#c98f8f",
    "#ff0000",
  ]);
  map.setPaintProperty("restroom-pins", "circle-radius", sat ? 5.5 : 5);
  map.setPaintProperty("restroom-pins", "circle-stroke-width", sat ? 2 : 1);
  map.setPaintProperty("restroom-pins", "circle-opacity", [
    "case",
    isSelected,
    1,
    ["get", "viewed"],
    sat ? 0.75 : 0.45,
    1,
  ]);
  map.setPaintProperty("restroom-pins", "circle-stroke-opacity", [
    "case",
    isSelected,
    1,
    ["get", "viewed"],
    sat ? 0.8 : 0.5,
    1,
  ]);
}

function setBasemap(next: Basemap) {
  if (!map || basemap.value === next) return;
  basemap.value = next;
  saveBasemap();
  map.setLayoutProperty(
    "carto-layer",
    "visibility",
    next === "map" ? "visible" : "none",
  );
  map.setLayoutProperty(
    "satellite-layer",
    "visibility",
    next === "satellite" ? "visible" : "none",
  );
  updateActivePin(props.selectedSlug);
}

// Diagnostics for devices that can't be attached to a debugger: visit the map
// with ?mapdebug=1 to see what the layout actually measures there.
const route = useRoute();
const showMapDebug = computed(() => route.query.mapdebug === "1");
const debugInfo = ref<Record<string, string>>({});
let debugTimer: ReturnType<typeof setInterval> | null = null;

function sampleDebug() {
  const el = mapContainer.value;
  if (!el) return;
  const area = el.closest<HTMLElement>(".map-area");
  const panel = area?.querySelector<HTMLElement>(".map-panel");
  const pad = getPanelPadding();
  const vv = window.visualViewport;
  debugInfo.value = {
    innerW: String(window.innerWidth),
    docW: String(document.documentElement.clientWidth),
    visualW: vv ? String(Math.round(vv.width)) : "n/a",
    scale: vv ? vv.scale.toFixed(2) : "n/a",
    panelOpenProp: String(props.panelOpen),
    areaFound: String(!!area),
    panelFound: String(!!panel),
    panelBox: panel
      ? `${panel.offsetLeft},${panel.offsetTop} ${panel.offsetWidth}x${panel.offsetHeight}`
      : "—",
    mapBox: `${el.offsetLeft},${el.offsetTop} ${el.offsetWidth}x${el.offsetHeight}`,
    padding: `L${pad.left} R${pad.right} T${pad.top} B${pad.bottom}`,
    mapPadding: map
      ? (() => {
          const p = map.getPadding();
          return `L${Math.round(p.left)} B${Math.round(p.bottom)}`;
        })()
      : "—",
  };
}

watch(
  showMapDebug,
  (on) => {
    if (debugTimer) clearInterval(debugTimer);
    debugTimer = on ? setInterval(sampleDebug, 500) : null;
    if (on) sampleDebug();
  },
  { immediate: true },
);

watch(() => props.selectedSlug, updateActivePin);

// Selection and panel visibility are watched together because clicking a pin
// changes both in the same tick. Two separate watchers would fire two camera
// moves and the second would cancel the first.
//
// flush: "post" so the panel element is in the DOM by the time getPanelPadding
// measures it; a pre-flush watcher runs before Vue has patched it in.
watch(
  [() => props.selectedSlug, () => props.panelOpen],
  ([slug, open], [prevSlug, prevOpen]) => {
    if (slug !== prevSlug) {
      // New pin: fly to it, offset for whatever the panel covers.
      flyToSelected(slug);
    } else {
      // Same pin, panel opened or closed: pan so it's centred in the space
      // that's now visible.
      recenterSelected();
    }
    // Only when the panel itself just opened: it slides in over 300ms, so
    // measure again once its layout has settled. Deliberately not done on a
    // selection change, which would cut the fly-to animation short.
    if (open && !prevOpen) {
      setTimeout(() => cameraOwned && recenterSelected(0), 360);
    }
  },
  { flush: "post" },
);

// iOS reports the URL bar showing/hiding through visualViewport, which doesn't
// always coincide with a ResizeObserver entry for the map container.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onViewportChange = () => {
    if (cameraOwned) scheduleRecenter();
  };
  vv.addEventListener("resize", onViewportChange);
  onBeforeUnmount(() => vv.removeEventListener("resize", onViewportChange));
}

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  resizeObs = null;
  if (recenterTimer) clearTimeout(recenterTimer);
  recenterTimer = null;
  if (debugTimer) clearInterval(debugTimer);
  debugTimer = null;
  hoverPopup?.remove();
  hoverPopup = null;
  map?.remove();
  map = null;
  sourceReady = false;
  needsInitialFit = false;
});
</script>

<template>
  <div class="map-wrap">
    <div ref="mapContainer" class="map" />

    <!-- Rendered here rather than registered as a maplibre IControl: the
         control containers put this in the wrong corner on iOS Safari, and a
         plain absolutely-positioned element lands where the CSS says on every
         browser. It sits in the top-left of the visible map, which on mobile
         means clearing the info panel's half when that panel is open. -->
    <div class="basemap-switch" :class="{ 'panel-open': panelOpen }">
      <button
        v-for="opt in [
          { key: 'map', label: 'Map' },
          { key: 'satellite', label: 'Satellite' },
        ] as const"
        :key="opt.key"
        type="button"
        :aria-pressed="basemap === opt.key"
        @click="setBasemap(opt.key)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div v-if="showMapDebug" class="map-debug">
      <div v-for="(v, k) in debugInfo" :key="k">{{ k }}: {{ v }}</div>
    </div>
  </div>
</template>

<style scoped>
.map-wrap {
  flex: 1 1 auto;
  overflow: hidden;
  position: relative;
  min-height: 0;
}
.map {
  position: absolute;
  inset: 16px;
  border: 1px solid #000;
}

/* Sits just inside the map's top-left corner (the map is inset 16px, so 24px
   puts an 8px gap inside its border). z-index clears the canvas but stays under
   the info panel (z-index 5). On desktop the panel is a bottom sheet, so the
   top-left corner is always clear. */
.basemap-switch {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 2;
  transition: left 0.3s ease;
  display: flex;
  flex-direction: column;
  border: 1px solid #000;
  background: #fff;
}

.basemap-switch button {
  appearance: none;
  border: 0;
  background: #fff;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1;
  padding: 5px 7px;
  cursor: pointer;
  text-align: left;
}

.basemap-switch button + button {
  border-top: 1px solid #000;
}

.basemap-switch button:hover:not([aria-pressed="true"]) {
  background: #f0f0f0;
}

.basemap-switch button[aria-pressed="true"] {
  background: #000;
  color: #fff;
  cursor: default;
}

.map-debug {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 6;
  max-width: 60%;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #000;
  padding: 4px 6px;
  font-family: Menlo, Consolas, monospace;
  font-size: 9px;
  line-height: 1.35;
  pointer-events: none;
  overflow-wrap: anywhere;
}

@media (max-width: 750px) {
  .map {
    inset: 8px;
  }

  /* Map is inset 8px here, so 16px keeps the same 8px gap inside its border. */
  .basemap-switch {
    top: 16px;
    left: 16px;
  }

  /* With the info panel open it covers the left half of the map, so the visible
     map is the right half, so the switcher goes in that half's top-left corner.
     The panel is 50% of .map-area and .map-wrap fills .map-area, so 50% here is
     the panel's right edge; +16px keeps the 8px inset plus an 8px gap. */
  .basemap-switch.panel-open {
    left: calc(50% + 16px);
  }
}
</style>

<style>
.restroom-hover-popup .maplibregl-popup-content {
  background: #fff;
  color: #000;
  border: 1px solid #000;
  border-radius: 0;
  padding: 6px 8px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  line-height: 1.25;
  box-shadow: none;
}
.restroom-hover-popup .maplibregl-popup-tip {
  display: none;
}
.restroom-hover-popup .hover-name {
  font-weight: 600;
}
.restroom-hover-popup .hover-date {
  color: #555;
  margin-top: 2px;
}
</style>
