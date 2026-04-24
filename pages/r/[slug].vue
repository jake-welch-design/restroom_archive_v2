<script setup lang="ts">
await useRestrooms()

const { selected } = useSelection()

useHead(() => {
  const r = selected.value
  if (!r) return { title: 'Restroom' }
  return {
    title: r.name,
    meta: [
      { property: 'og:title', content: `${r.name} — Restroom Archive` },
      { property: 'og:description', content: `${r.location} · scanned ${r.date}` },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }
})
</script>

<template>
  <Directory />
</template>
