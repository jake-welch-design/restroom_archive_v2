<script setup lang="ts">
await useRestrooms()

const { selected } = useSelection()
const reqUrl = useRequestURL()

function toAbsolute(path: string | null | undefined) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return new URL(path, reqUrl.origin).toString()
}

useHead(() => {
  const r = selected.value
  if (!r) return { title: 'Restroom' }
  const title = `The Restroom Archive – ${r.name}`
  const description = `${r.location} · scanned ${r.date}`
  const image = toAbsolute(r.thumbUrl)
  const pageUrl = toAbsolute(`/r/${r.slug}`)
  const meta: Array<Record<string, string>> = [
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
  ]
  if (pageUrl) meta.push({ property: 'og:url', content: pageUrl })
  if (image) {
    meta.push({ property: 'og:image', content: image })
    meta.push({ name: 'twitter:image', content: image })
  }
  return { title: r.name, meta }
})
</script>

<template>
  <Directory />
</template>
