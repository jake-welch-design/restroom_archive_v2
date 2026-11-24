<script setup lang="ts">
// v1 back-compat: redirect /#/slug → /r/slug so old shared links keep working.
if (import.meta.client) {
  const router = useRouter();
  onMounted(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#/")) {
      const slug = hash.slice(2);
      if (slug) router.replace(`/r/${slug}`);
    }
  });
}

// Light/dark mode, rendered onto <html> on the server (see useTheme).
const { pref } = useTheme();

useHead({
  htmlAttrs: { "data-theme": pref },
  titleTemplate: (title) =>
    title ? `The Restroom Archive – ${title}` : "The Restroom Archive",
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <WeeklyReportDialog />
</template>
