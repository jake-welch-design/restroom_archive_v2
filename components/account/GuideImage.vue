<script setup lang="ts">
/**
 * A captioned still for the Archivist Guide — the counterpart to GuideVideo,
 * kept to the same width and caption so a step that mixes the two reads as one
 * column rather than two sizes of media.
 *
 * `name` is an asset basename under public/guide/, as in GuideVideo, except
 * that stills are a single `.jpg`.
 */
const props = defineProps<{
  /** Asset basename under public/guide/, e.g. "holes". */
  name: string;
  /** Caption, and the image's alt text. */
  label: string;
}>();
</script>

<template>
  <figure class="guide-figure">
    <img :src="`/guide/${props.name}.jpg`" :alt="props.label" loading="lazy" />
    <figcaption>{{ props.label }}</figcaption>
  </figure>
</template>

<style scoped>
.guide-figure {
  margin: 0 0 0.9em;
}

/* Matches GuideVideo: see the note there on why guide media is capped. */
.guide-figure img {
  display: block;
  width: 100%;
  max-width: 460px;
  aspect-ratio: 1;
  margin: 0 auto;
  border: 1px solid #ddd;
  background: #f7f7f7;
}

.guide-figure figcaption {
  max-width: 460px;
  margin: 2px auto 0;
  font-size: 12px;
  line-height: 1.4;
  color: #666;
}
</style>
