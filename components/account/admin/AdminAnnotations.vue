<script setup lang="ts">
/**
 * Every annotation in the archive, reported or not.
 *
 * A browse list rather than a queue: there is no backlog to clear, so it
 * carries no badge and is fetched only when the section is first opened.
 *
 * Hiding is reversible and does not delete. An annotation carries the camera
 * position it was written from, which the viewer uses to fly back to that exact
 * view, so destroying one loses more than its text.
 */
const { data: annotations, refresh } = useAdminAnnotations();

// This component mounts only when its section is selected, so mounting is
// what makes the fetch lazy. The list is declared with `immediate: false`.
onMounted(() => refresh());
const { refresh: refreshReports } = useAnnotationReports();
const action = useAdminAction();

function hide(id: number) {
  return action.run(`ann-hide-${id}`, `/api/admin/annotations/${id}/hide`, {
    // Hiding also resolves any open reports on the annotation, so the reports
    // queue is stale afterwards even though it is not on screen.
    after: () => Promise.all([refresh(), refreshReports()]),
    fallbackError: "Could not hide annotation.",
  });
}

function unhide(id: number) {
  return action.run(`ann-unhide-${id}`, `/api/admin/annotations/${id}/unhide`, {
    after: refresh,
    fallbackError: "Could not unhide annotation.",
  });
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <div v-if="!annotations?.length" class="empty">No annotations yet.</div>

    <ul v-else class="simple-list">
      <li
        v-for="a in annotations"
        :key="a.id"
        class="simple-row"
        :class="{ 'is-hidden': a.hiddenAt }"
      >
        <div class="simple-main">
          <NuxtLink class="simple-title link" :to="`/r/${a.restroom.slug}`">
            {{ a.restroom.name }}
          </NuxtLink>
          <span class="simple-meta reason">{{ a.body }}</span>
          <span class="simple-meta">
            By
            <UserAttribution :user="a.author" fallback="deleted user" />
            · {{ a.createdAt }}
          </span>
          <span class="simple-meta">
            <span v-if="a.hiddenAt" class="pill pill-hidden">Hidden</span>
            <span v-if="a.openReportCount" class="pill pill-reported">
              {{ a.openReportCount }} open
              {{ a.openReportCount === 1 ? "report" : "reports" }}
            </span>
          </span>
        </div>

        <div class="simple-actions">
          <button
            v-if="!a.hiddenAt"
            type="button"
            class="btn btn-reject"
            :disabled="action.isRunning(`ann-hide-${a.id}`)"
            @click="hide(a.id)"
          >
            {{ action.isRunning(`ann-hide-${a.id}`) ? "…" : "Hide" }}
          </button>
          <button
            v-else
            type="button"
            class="btn"
            :disabled="action.isRunning(`ann-unhide-${a.id}`)"
            @click="unhide(a.id)"
          >
            {{ action.isRunning(`ann-unhide-${a.id}`) ? "…" : "Unhide" }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
