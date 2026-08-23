<script setup lang="ts">
import maplibregl from "maplibre-gl";
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

// Pins the user has already opened, persisted so the "already looked at"
// state survives reloads. Viewed pins render dimmed + desaturated.
const VIEWED_KEY = "ra:viewedPins";
const viewedSlugs = new Set<string>();

// Basemap choice ("map" = CARTO light, "satellite" = Esri imagery), persisted
// so the map opens in whichever mode was last used.
const BASEMAP_KEY = "ra:basemap";
type Basemap = "map" | "satellite";
let basemap: Basemap = "map";

function loadBasemap() {
  try {
    if (localStorage.getItem(BASEMAP_KEY) === "satellite") basemap = "satellite";
  } catch {
    // Ignore unavailable storage — the default basemap is fine.
  }
}

function saveBasemap() {
  try {
    localStorage.setItem(BASEMAP_KEY, basemap);
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
    // Ignore malformed / unavailable storage — viewed state is best-effort.
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
            // Note the {y}/{x} order — Esri's REST tile scheme, not {x}/{y}.
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
      // follows automatically — MapLibre credits only sources whose layers are
      // visible.
      layers: [
        {
          id: "carto-layer",
          type: "raster",
          source: "carto",
          layout: { visibility: basemap === "map" ? "visible" : "none" },
          // Deliberate desaturation of the light basemap; imagery is left alone.
          paint: { "raster-saturation": -0.15 },
        },
        {
          id: "satellite-layer",
          type: "raster",
          source: "satellite",
          layout: { visibility: basemap === "satellite" ? "visible" : "none" },
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
  // Top-left on desktop. On mobile the info panel covers the left half of the
  // map top-to-bottom, so the switcher would sit underneath it — there it stays
  // in the top-right strip, stacked below the zoom control.
  map.addControl(
    new BasemapControl(),
    window.innerWidth <= 750 ? "top-right" : "top-left",
  );

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
      const safe = (s: string) =>
        s.replace(/[&<>"']/g, (c) =>
          c === "&"
            ? "&amp;"
            : c === "<"
              ? "&lt;"
              : c === ">"
                ? "&gt;"
                : c === '"'
                  ? "&quot;"
                  : "&#39;",
        );
      const html = `<div class="hover-name">${safe(name)}</div>${
        date ? `<div class="hover-date">${safe(date)}</div>` : ""
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

  // Resize the map whenever the container (or its parent) changes size.
  // This also handles the on-refresh case: the flex layout resolves after
  // mount, ResizeObserver fires, resize() corrects the canvas, and if the
  // initial fitView was deferred we run it now.
  resizeObs = new ResizeObserver(() => {
    if (!map) return;
    map.resize();
    if (needsInitialFit && el.clientWidth > 0 && el.clientHeight > 0) {
      needsInitialFit = false;
      initialCamera(initialPins);
    }
  });
  resizeObs.observe(el);
  if (el.parentElement) resizeObs.observe(el.parentElement);
}

onMounted(() => {
  loadViewedSlugs();
  loadBasemap();
  nextTick(initMap);
});

// Data-only update on row changes — never moves the camera so flyTo is never
// overridden by data refreshes (e.g. thumbnail auto-capture → refreshNuxtData).
watch(
  () => props.rows,
  (rows) => updatePinData(rows),
);

function getPanelPadding(): maplibregl.PaddingOptions {
  if (!props.panelOpen) return { top: 0, bottom: 0, left: 0, right: 0 };
  const isMobile = window.innerWidth <= 750;
  if (isMobile) {
    return { top: 0, bottom: 0, left: Math.round(window.innerWidth * 0.5), right: 0 };
  }
  const h = mapContainer.value?.clientHeight ?? 0;
  return { top: 0, bottom: Math.round(h * 0.3333), left: 0, right: 0 };
}

// Returns whether the camera actually moved — callers use that to fall back to
// a fit-all view when there's nothing selected (or it has no coordinates).
function flyToSelected(slug: string | null, animate = true) {
  if (!slug || !map || !sourceReady) return false;
  const row = props.rows.find((r) => r.slug === slug);
  if (row?.lng == null || row?.lat == null) return false;
  const camera = {
    center: [row.lng, row.lat] as [number, number],
    zoom: 14,
    padding: getPanelPadding(),
  };
  // The `duration` key is omitted (not set to undefined) for the animated case:
  // MapLibre does `+options.duration` whenever the key is present, so passing
  // undefined yields NaN, and the animation then writes NaN into the transform's
  // zoom/centre — every later camera move throws and the map stops responding.
  // jumpTo isn't an option for the instant case: it sets the raw viewport centre
  // and ignores `padding`, which would drop the pin behind the info panel.
  map.flyTo(animate ? camera : { ...camera, duration: 0 });
  return true;
}

// Re-centre the selected pin at the current zoom. Used when the info panel
// opens or closes: the panel covers part of the map, so the pin has to shift to
// stay centred in whatever is still visible. Zoom is deliberately untouched —
// toggling a panel should pan, never zoom.
function recenterSelected() {
  if (!map || !sourceReady) return;
  const row = props.rows.find((r) => r.slug === props.selectedSlug);
  if (row?.lng == null || row?.lat == null) return;
  map.easeTo({
    center: [row.lng, row.lat],
    padding: getPanelPadding(),
    duration: 400,
  });
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
  const sat = basemap === "satellite";
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
  if (!map || basemap === next) return;
  basemap = next;
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

// Two-button basemap switcher, added to the same corner as the zoom control so
// it stacks directly beneath it.
class BasemapControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null;

  onAdd() {
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl basemap-ctrl";
    for (const opt of [
      { key: "map", label: "Map" },
      { key: "satellite", label: "Satellite" },
    ] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.label;
      btn.setAttribute("aria-pressed", String(basemap === opt.key));
      btn.addEventListener("click", () => {
        setBasemap(opt.key);
        for (const b of el.querySelectorAll("button")) {
          b.setAttribute("aria-pressed", String(b.textContent === opt.label));
        }
      });
      el.appendChild(btn);
    }
    this.container = el;
    return el;
  }

  onRemove() {
    this.container?.remove();
    this.container = null;
  }
}

watch(() => props.selectedSlug, updateActivePin);

// Selection and panel visibility are watched together because clicking a pin
// changes both in the same tick — two separate watchers would fire two camera
// moves and the second would cancel the first.
watch(
  [() => props.selectedSlug, () => props.panelOpen],
  ([slug], [prevSlug]) => {
    if (slug !== prevSlug) {
      // New pin: fly to it, offset for whatever the panel covers.
      flyToSelected(slug);
    } else {
      // Same pin, panel opened or closed: pan so it's centred in the space
      // that's now visible.
      recenterSelected();
    }
  },
);

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  resizeObs = null;
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

@media (max-width: 750px) {
  .map {
    inset: 8px;
  }
}
</style>

<style>
/* Basemap switcher: square, flat and black-bordered to match the catalog
   chrome rather than MapLibre's default rounded control group. */
.basemap-ctrl {
  display: flex;
  flex-direction: column;
  border: 1px solid #000;
  background: #fff;
  box-shadow: none;
  overflow: hidden;
}
.basemap-ctrl button {
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
.basemap-ctrl button + button {
  border-top: 1px solid #000;
}
.basemap-ctrl button:hover:not([aria-pressed="true"]) {
  background: #f0f0f0;
}
.basemap-ctrl button[aria-pressed="true"] {
  background: #000;
  color: #fff;
  cursor: default;
}

@media (max-width: 750px) {
  .basemap-ctrl button {
    font-size: 10px;
    padding: 4px 6px;
  }
}

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
