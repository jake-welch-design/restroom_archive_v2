<script setup lang="ts">
import maplibregl from "maplibre-gl";
import type { RestroomSummary } from "~/types/restroom";

const props = defineProps<{ rows: RestroomSummary[] }>();
const emit = defineEmits<{ select: [slug: string] }>();

const mapContainer = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;
let resizeObs: ResizeObserver | null = null;
let sourceReady = false;
let hoverPopup: maplibregl.Popup | null = null;

function setPins(rows: RestroomSummary[]) {
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

  // Wait for the flex parent (.map-wrap) to have a non-zero height before
  // initialising the map. The .map container is position:absolute so its
  // clientHeight is derived from the parent — watching the parent directly
  // avoids resolving too early on fresh page loads.
  await nextTick();

  await new Promise<void>((resolve) => {
    const wrap = mapContainer.value?.parentElement;
    if (!wrap) return resolve();
    if (wrap.clientWidth > 0 && wrap.clientHeight > 0) return resolve();
    const ro = new ResizeObserver(() => {
      if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
        ro.disconnect();
        resolve();
      }
    });
    ro.observe(wrap);
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
      if (!slug) return;
      map!.flyTo({ center: e.lngLat, zoom: 14 });
      emit("select", slug);
    });

    hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: "restroom-hover-popup",
    });

    map!.on("mousemove", "restroom-pins", (e) => {
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
    map!.on("mouseleave", "restroom-pins", () => {
      if (!map) return;
      map.getCanvas().style.cursor = "";
      hoverPopup?.remove();
    });

    sourceReady = true;
    setPins(props.rows);
    map!.resize();
    // Cascade of resizes to catch any remaining layout shifts after load
    requestAnimationFrame(() => {
      map?.resize();
      requestAnimationFrame(() => map?.resize());
    });
    setTimeout(() => map?.resize(), 300);
  });

  resizeObs = new ResizeObserver(() => map?.resize());
  resizeObs.observe(mapContainer.value);
  // Also observe the flex parent so panel-open/close transitions trigger resize
  if (mapContainer.value.parentElement) {
    resizeObs.observe(mapContainer.value.parentElement);
  }
});

watch(
  () => props.rows,
  (rows) => setPins(rows),
);

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  resizeObs = null;
  hoverPopup?.remove();
  hoverPopup = null;
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
