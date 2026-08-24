<script setup lang="ts">
await useRestrooms();

const { toAbsolute } = useAbsoluteUrl();

const siteUrl = "https://restroomarchive.com";
const description =
  "An on-going repository of public restrooms dedicated to documenting the humorous, chaotic, and often scary nature of these publicly accessible private spaces.";

useSeoMeta({
  description,
  ogTitle: "The Restroom Archive",
  ogDescription: description,
  ogUrl: siteUrl,
  ogImage: toAbsolute("/metatag.jpg"),
  twitterTitle: "The Restroom Archive",
  twitterDescription: description,
  twitterImage: toAbsolute("/metatag.jpg"),
});

useHead({
  link: [{ rel: "canonical", href: siteUrl }],
});
</script>

<template>
  <Catalog />
</template>
