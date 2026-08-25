<script setup lang="ts">
await useRestrooms();

const { toAbsolute } = useAbsoluteUrl();

const siteUrl = "https://restroomarchive.com";
const description =
  "The Restroom Archive is an ongoing repository of publicly accessible restrooms.";

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
