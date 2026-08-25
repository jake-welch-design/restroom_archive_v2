<script setup lang="ts">
import type { PublicUserRef } from "~/types/restroom";

const props = withDefaults(
  defineProps<{
    user: PublicUserRef | null | undefined;
    prefix?: string;
    fallback?: string;
  }>(),
  {
    prefix: "",
    fallback: "Legacy entry",
  },
);

const label = computed(() => {
  const u = props.user;
  if (!u) return props.fallback;
  if (u.displayName && u.displayName.trim().length) return u.displayName;
  return `@${u.username}`;
});
</script>

<template>
  <span class="user-attribution">{{ prefix }}{{ label }}</span>
</template>

<style scoped>
.user-attribution {
  font: inherit;
}
</style>
