<script setup lang="ts">
await useRestrooms();

const { selected } = useSelection();
const { toAbsolute } = useAbsoluteUrl();

useHead(() => {
  const r = selected.value;
  if (!r) return { title: "Restroom" };

  const title = `The Restroom Archive – ${r.name}`;
  const description = `${r.location} · scanned ${r.date}`;
  const image = toAbsolute(r.thumbUrl);
  const pageUrl = toAbsolute(`/r/${r.slug}`);

  const meta: Array<Record<string, string>> = [
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    {
      name: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    },
  ];
  if (pageUrl) meta.push({ property: "og:url", content: pageUrl });
  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }
  if (r.status === "pending") {
    meta.push({ name: "robots", content: "noindex" });
  }

  const link: Array<Record<string, string>> = [];
  if (pageUrl) link.push({ rel: "canonical", href: pageUrl });

  const script: Array<Record<string, string>> = [];
  if (r.status !== "pending") {
    const schema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Place",
      name: r.name,
      url: pageUrl,
      description: r.description || description,
      image: image,
      dateCreated: r.isoDate,
    };
    if (r.lat != null && r.lng != null) {
      schema.geo = {
        "@type": "GeoCoordinates",
        latitude: r.lat,
        longitude: r.lng,
      };
    }
    script.push({
      type: "application/ld+json",
      innerHTML: JSON.stringify(schema),
    });
  }

  return { title: r.name, meta, link, script };
});
</script>

<template>
  <h1 v-if="selected" class="sr-only">{{ selected.name }}</h1>
  <Catalog />
</template>
