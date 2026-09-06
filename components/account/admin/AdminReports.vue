<script setup lang="ts">
/**
 * Annotations somebody reported, awaiting a decision.
 *
 * A queue: each row is an open report, so it carries a badge. Hiding the
 * annotation resolves every open report on it in the same operation, which is
 * why hiding and dismissing both clear the row.
 */
import type { AnnotationReport } from "~/types/account";

const { data: reports, refresh } = useAnnotationReports();
const action = useAdminAction();

type SortKey = "reportedAt" | "restroom" | "reporter" | "author";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "reportedAt", label: "Date reported" },
  { key: "restroom", label: "Restroom" },
  { key: "reporter", label: "Reporter" },
  { key: "author", label: "Annotation author" },
];

function nameOf(u: { username: string; displayName: string | null } | null) {
  return (u?.displayName || u?.username || "").toLowerCase();
}

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  AnnotationReport,
  SortKey
>({
  source: reports,
  searchFields: (r) => [
    r.restroom.name,
    r.annotation.body,
    r.reportReason,
    r.reporter?.username,
    r.reporter?.displayName,
    r.author?.username,
    r.author?.displayName,
  ],
  // Oldest first: a report nobody has answered is the point of the queue.
  defaultKey: "reportedAt",
  defaultDir: "asc",
  compare: (a, b, key) => {
    switch (key) {
      case "restroom":
        return (
          a.restroom.name.localeCompare(b.restroom.name) ||
          a.reportId - b.reportId
        );
      case "reporter":
        return (
          nameOf(a.reporter).localeCompare(nameOf(b.reporter)) ||
          a.reportId - b.reportId
        );
      case "author":
        return (
          nameOf(a.author).localeCompare(nameOf(b.author)) ||
          a.reportId - b.reportId
        );
      default:
        // Keyed on the report rather than the annotation: two reports against
        // one annotation are two rows, and the order that matters is when each
        // was raised.
        return (
          a.reportCreatedAt.localeCompare(b.reportCreatedAt) ||
          a.reportId - b.reportId
        );
    }
  },
});

function hideAnnotation(id: number) {
  return action.run(`ann-hide-${id}`, `/api/admin/annotations/${id}/hide`, {
    after: refresh,
    fallbackError: "Could not hide annotation.",
  });
}

function dismissReports(id: number) {
  return action.run(
    `ann-dismiss-${id}`,
    `/api/admin/annotations/${id}/dismiss-reports`,
    { after: refresh, fallbackError: "Could not dismiss reports." },
  );
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <AdminListControls
      v-if="reports?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search reports"
      id-prefix="reports"
    />

    <div v-if="!reports?.length" class="empty">No reported annotations.</div>
    <div v-else-if="isEmptyFromSearch" class="empty">
      No reports match “{{ query }}”.
    </div>

    <ul v-else class="simple-list">
      <li v-for="r in visible" :key="r.reportId" class="simple-row">
        <div class="simple-main">
          <NuxtLink class="simple-title link" :to="`/r/${r.restroom.slug}`">
            {{ r.restroom.name }}
          </NuxtLink>
          <span class="simple-meta reason">{{ r.annotation.body }}</span>
          <span class="simple-meta">
            By
            <UserAttribution :user="r.author" fallback="unknown" />
            · reported by
            <UserAttribution :user="r.reporter" fallback="unknown" />
            · {{ r.reportCreatedAt }}
          </span>
          <span v-if="r.reportReason" class="simple-meta reason">
            Reason: {{ r.reportReason }}
          </span>
          <span v-if="r.annotation.hiddenAt" class="simple-meta dim">
            Already hidden ({{ r.annotation.hiddenAt }})
          </span>
        </div>
        <div class="simple-actions">
          <button
            v-if="!r.annotation.hiddenAt"
            type="button"
            class="btn btn-reject"
            :disabled="action.isRunning(`ann-hide-${r.annotation.id}`)"
            @click="hideAnnotation(r.annotation.id)"
          >
            {{
              action.isRunning(`ann-hide-${r.annotation.id}`)
                ? "…"
                : "Hide annotation"
            }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="action.isRunning(`ann-dismiss-${r.annotation.id}`)"
            @click="dismissReports(r.annotation.id)"
          >
            {{
              action.isRunning(`ann-dismiss-${r.annotation.id}`)
                ? "…"
                : "Dismiss"
            }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
