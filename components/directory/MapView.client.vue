<script setup lang="ts">
import maplibregl from "maplibre-gl";
import type { RestroomSummary } from "~/types/restroom";

const props = defineProps<{ rows: RestroomSummary[] }>();
const emit = defineEmits<{ select: [slug: string] }>();

const mapContainer = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;
let resizeObs: ResizeObserver | null = null;
let sourceReady = false;

function setPins(rows: RestroomSummary[]) {
  if (!map || !sourceReady) return;
  const pinned = rows.filter((r) => r.lat != null && r.lng != null);
  (map.getSource("restrooms") as maplibregl.GeoJSONSource).setData({
    type: "FeatureCollection",
    features: pinned.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.lng!, r.lat!] },
      properties: { slug: r.slug, name: r.name },
    })),
  });
  if (!pinned.length) return;
  if (pinned.length === 1) {
    map.easeTo({ center: [pinned[0].lng!, pinned[0].lat!], zoom: 12 });
  } else {
    const bounds = new maplibregl.LngLatBounds();
    pinned.forEach((r) => bounds.extend([r.lng!, r.lat!]));
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 400 });
  }
}

onMounted(async () => {
  if (!mapContainer.value) return;

  // Wait for the container to have non-zero size before creating the map.
  // On a fresh load in map view, flex layout may not have settled when
  // onMounted fires — defer one tick first, then wait for a real size.
  await nextTick();

  await new Promise<void>((resolve) => {
    const el = mapContainer.value;
    if (!el) return resolve();
    if (el.clientWidth > 0 && el.clientHeight > 0) return resolve();
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        ro.disconnect();
        resolve();
      }
    });
    ro.observe(el);
  });

  if (!mapContainer.value) return;

  map = new maplibregl.Map({
    container: mapContainer.value,
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
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.on("load", () => {
    map!.addSource("restrooms", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map!.addLayer({
      id: "restroom-pins",
      type: "circle",
      source: "restrooms",
      paint: {
        "circle-radius": 6,
        "circle-color": "#ff0000",
        // "circle-stroke-width": 2,
        // "circle-stroke-color": "#fff",
      },
    });

    map!.on("click", "restroom-pins", (e) => {
      const slug = e.features?.[0]?.properties?.slug;
      if (slug) emit("select", slug);
    });

    map!.on("mouseenter", "restroom-pins", () => {
      map!.getCanvas().style.cursor = "pointer";
    });
    map!.on("mouseleave", "restroom-pins", () => {
      map!.getCanvas().style.cursor = "";
    });

    sourceReady = true;
    setPins(props.rows);
    map!.resize();
    // Extra resize after the next paint to catch any deferred flex layout
    requestAnimationFrame(() => map?.resize());
  });

  resizeObs = new ResizeObserver(() => map?.resize());
  resizeObs.observe(mapContainer.value);
});

watch(
  () => props.rows,
  (rows) => setPins(rows),
);

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  resizeObs = null;
  map?.remove();
  map = null;
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
