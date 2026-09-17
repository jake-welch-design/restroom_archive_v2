<script setup lang="ts">
/**
 * A captioned still for the Archivist Guide — the counterpart to GuideVideo,
 * kept to the same width and caption so a step that mixes the two reads as one
 * column rather than two sizes of media.
 *
 * `name` is an asset basename under public/guide/, as in GuideVideo, except
 * that stills are a single `.jpg`.
 *
 * The still opens at full size in a new tab when clicked. The sources are
 * 1080px square shown in a 460px column, and at least one of them — the
 * description example — is a screenshot whose point is text the reader has to
 * actually read, which 460px leaves legible only just. The diagnostic stills
 * benefit too: a blurred patch or a break in the mesh is worth looking at
 * closely.
 */
const props = defineProps<{
  /** Asset basename under public/guide/, e.g. "holes". */
  name: string;
  /** Caption, and the image's alt text. */
  label: string;
}>();

const src = computed(() => `/guide/${props.name}.jpg`);
</script>

<template>
  <figure class="guide-figure">
    <!-- The alt text names the link, so it needs no separate label. -->
    <a :href="src" target="_blank" rel="noopener" title="Open full size">
      <img :src="src" :alt="props.label" loading="lazy" />
    </a>
    <figcaption>{{ props.label }}</figcaption>
  </figure>
</template>

<style scoped>
.guide-figure {
  margin: 0 0 0.9em;
}

/* The dialog underlines its links; this one is an image, so it shouldn't get a
   rule under it. `block` also drops the inline descender gap under the img. */
.guide-figure a {
  display: block;
  text-decoration: none;
  cursor: zoom-in;
}

.guide-figure a:focus-visible {
  outline: 2px solid #000;
  outline-offset: 2px;
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
