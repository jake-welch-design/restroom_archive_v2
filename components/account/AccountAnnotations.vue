<script setup lang="ts">
/**
 * The Annotations tab: every annotation the signed-in user has left, with the
 * restroom each is on.
 *
 * Read-and-delete only. Editing an annotation would invalidate the camera
 * position stored alongside it, which is what lets the viewer fly back to the
 * exact view the comment was written about.
 */
const { data: annotations, refresh } = useMyAnnotations();
const action = useAsyncAction("Could not delete annotation.");

const busyId = ref<number | null>(null);

async function remove(slug: string, id: number) {
  if (!confirm("Delete this annotation?")) return;

  busyId.value = id;
  const ok = await action.run(() =>
    $fetch(`/api/restrooms/${slug}/annotations/${id}`, { method: "DELETE" }),
  );
  busyId.value = null;
  if (ok) await refresh();
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <div v-if="!annotations?.length" class="empty">No annotations yet.</div>

    <ul v-else class="simple-list">
      <li v-for="a in annotations" :key="a.id" class="simple-row">
        <div class="simple-main">
          <NuxtLink class="simple-title link" :to="`/r/${a.restroomSlug}`">
            {{ a.restroomName }}
          </NuxtLink>
          <span class="simple-meta annotation-text">{{ a.body }}</span>
          <span class="simple-meta">
            {{ a.restroomDate }} · {{ a.restroomLocation }}
          </span>
        </div>
        <div class="simple-actions">
          <button
            type="button"
            class="icon-btn"
            :disabled="busyId === a.id"
            title="Delete annotation"
            @click="remove(a.restroomSlug, a.id)"
          >
            {{ busyId === a.id ? "…" : "✕" }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* The annotation's own text, which is the point of the row, so it reads at
   full strength rather than in the muted colour the rest of the meta uses. */
.annotation-text {
  color: #000;
}
</style>
