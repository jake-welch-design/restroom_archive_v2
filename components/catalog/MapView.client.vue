<script setup lang="ts">
import maplibregl from "maplibre-gl";
import type { RestroomSummary } from "~/types/restroom";

const props = defineProps<{
  rows: RestroomSummary[];
  selectedSlug: string | null;
}>();
const emit = defineEmits<{ select: [slug: string] }>();

const mapContainer = ref<HTMLDivElement | null>(null);

let map: maplibregl.Map | null = null;
let resizeObs: ResizeObserver | null = null;
let sourceReady = false;
let hoverPopup: maplibregl.Popup | null = null;
let needsInitialFit = false;
let initialPins: RestroomSummary[] = [];

function updatePinData(rows: RestroomSummary[]) {
  if (!map || !sourceReady) return;
  const pinned = rows.filter((r) => r.lat != null && r.lng != null);
  (map.getSource("restrooms") as maplibregl.GeoJSONSource).setData({
    type: "FeatureCollection",
    features: pinned.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.lng!, r.lat!] },
      properties: { slug: r.slug, name: r.name, date: r.date },
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
      },
      layers: [
        {
          id: "carto-layer",
          type: "raster",
          source: "carto",
          paint: { "raster-saturation": -0.15 },
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
      const row = props.rows.find((r) => r.slug === slug);
      if (row?.lng != null && row?.lat != null) {
        map!.flyTo({ center: [row.lng, row.lat], zoom: 14 });
      }
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

    // If the container has real dimensions, fit now; otherwise defer until
    // the first resize when the flex layout resolves.
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      fitView(pinned);
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
      fitView(initialPins);
    }
  });
  resizeObs.observe(el);
  if (el.parentElement) resizeObs.observe(el.parentElement);
}

onMounted(() => {
  nextTick(initMap);
});

// Data-only update on row changes — never moves the camera so flyTo is never
// overridden by data refreshes (e.g. thumbnail auto-capture → refreshNuxtData).
watch(
  () => props.rows,
  (rows) => updatePinData(rows),
);

function updateActivePin(slug: string | null) {
  if (!map || !sourceReady) return;
  if (slug) {
    map.setPaintProperty("restroom-pins", "circle-color", [
      "case",
      ["==", ["get", "slug"], slug],
      "#e33",
      "#ff0000",
    ]);
  } else {
    map.setPaintProperty("restroom-pins", "circle-color", "#ff0000");
  }
}

watch(
  () => props.selectedSlug,
  (slug) => {
    updateActivePin(slug);
    if (!slug || !map || !sourceReady) return;
    const row = props.rows.find((r) => r.slug === slug);
    if (row?.lng != null && row?.lat != null) {
      map.flyTo({ center: [row.lng, row.lat], zoom: 14 });
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
