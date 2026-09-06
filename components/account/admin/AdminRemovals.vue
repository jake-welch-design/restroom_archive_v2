<script setup lang="ts">
/**
 * Submitters asking for their own entry to be taken down.
 *
 * A queue: each row is a person waiting on an answer, so it carries a badge.
 * The two outcomes are not symmetrical — granting deletes the scan and cannot
 * be undone, dismissing only closes the request — which is why one is behind a
 * confirm and the other is not.
 */
import type { RemovalRequest } from "~/types/account";

const { data: removals, refresh } = useRemovalQueue();
const action = useAdminAction();

type SortKey = "name" | "location" | "date" | "requester";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "date", label: "Scan date" },
  { key: "requester", label: "Requester" },
];

function requesterName(r: RemovalRequest) {
  return (
    r.requester?.displayName ||
    r.requester?.username ||
    ""
  ).toLowerCase();
}

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  RemovalRequest,
  SortKey
>({
  source: removals,
  searchFields: (r) => [
    r.name,
    r.location,
    r.removalReason,
    r.requester?.username,
    r.requester?.displayName,
    r.requester?.email,
  ],
  defaultKey: "name",
  defaultDir: "asc",
  compare: (a, b, key) => {
    switch (key) {
      case "location":
        return a.location.localeCompare(b.location);
      case "date":
        return a.date.localeCompare(b.date) || a.id - b.id;
      case "requester":
        return (
          requesterName(a).localeCompare(requesterName(b)) ||
          a.name.localeCompare(b.name)
        );
      default:
        return a.name.localeCompare(b.name) || a.id - b.id;
    }
  },
});

/**
 * Grants the request: the entry leaves the archive and its scan file is
 * deleted. Irreversible, hence the confirm.
 */
function removeRestroom(id: number, name: string) {
  const confirmed = confirm(
    `Remove “${name}” from the archive? The scan file is deleted and this cannot be undone.`,
  );
  if (!confirmed) return;

  return action.run(`rm-remove-${id}`, `/api/admin/restrooms/${id}/remove`, {
    after: async () => {
      await refresh();
      await refreshNuxtData("restrooms");
    },
  });
}

/** Turns the request down: the entry stays published, the request leaves. */
function dismissRemoval(id: number) {
  return action.run(
    `rm-dismiss-${id}`,
    `/api/admin/restrooms/${id}/dismiss-removal`,
    { after: refresh },
  );
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <AdminListControls
      v-if="removals?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search requests"
      id-prefix="removals"
    />

    <div v-if="!removals?.length" class="empty">No removal requests.</div>
    <div v-else-if="isEmptyFromSearch" class="empty">
      No requests match “{{ query }}”.
    </div>

    <ul v-else class="simple-list">
      <li v-for="r in visible" :key="r.id" class="simple-row">
        <div class="simple-main">
          <span class="simple-title">{{ r.name }}</span>
          <span class="simple-meta">
            {{ r.date }} · {{ r.location }} · status: {{ r.status }}
          </span>
          <span v-if="r.removalReason" class="simple-meta reason">
            Reason: {{ r.removalReason }}
          </span>
          <span class="simple-meta">
            Requested by
            <UserAttribution :user="r.requester" fallback="unknown" />
          </span>
        </div>
        <div class="simple-actions">
          <button
            type="button"
            class="btn btn-reject"
            title="Grant the request: take the entry out of the archive"
            :disabled="action.isRunning(`rm-remove-${r.id}`)"
            @click="removeRestroom(r.id, r.name)"
          >
            {{ action.isRunning(`rm-remove-${r.id}`) ? "…" : "Remove" }}
          </button>
          <button
            type="button"
            class="btn"
            title="Turn the request down: the entry stays published"
            :disabled="action.isRunning(`rm-dismiss-${r.id}`)"
            @click="dismissRemoval(r.id)"
          >
            {{ action.isRunning(`rm-dismiss-${r.id}`) ? "…" : "Dismiss" }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
