<script setup lang="ts">
import type { PublicUserRef } from "~/types/restroom";

/**
 * A user's public name, for crediting a submission, annotation or audit entry.
 *
 * Carries no styling of its own: type and colour come from the host, which
 * knows whether the name is body text or a meta line. It previously set
 * `font: inherit`, which reads as a no-op on a span but is not — at equal
 * specificity to a host's own class, and in a separate CSS chunk, it won the
 * order tie often enough to reset the host's `font-size` back to the inherited
 * body size.
 */

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
