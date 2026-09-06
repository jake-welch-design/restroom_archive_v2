<script setup lang="ts">
/**
 * Accounts asking for submission access.
 *
 * A queue: each row is a person waiting to be let in, so it carries a badge.
 * Both outcomes also change how the account reads in the Directory, which is
 * why each refreshes that list as well as this one.
 */
import type { PendingUser } from "~/types/account";

const { data: pendingUsers, refresh } = useUserQueue();
const { refresh: refreshAccounts } = useAdminAccounts();
const action = useAdminAction();

type SortKey = "requestedAt" | "name" | "username" | "email";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "requestedAt", label: "Date requested" },
  { key: "name", label: "Name" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
];

/** An account with no display name is listed under the handle it does have. */
function sortName(u: PendingUser) {
  return (u.displayName || u.username).toLowerCase();
}

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  PendingUser,
  SortKey
>({
  source: pendingUsers,
  searchFields: (u) => [u.username, u.email, u.displayName],
  // Oldest first: this is a queue, and the longest wait is the one to answer.
  defaultKey: "requestedAt",
  defaultDir: "asc",
  compare: (a, b, key) => {
    switch (key) {
      case "name":
        return sortName(a).localeCompare(sortName(b));
      case "username":
        return a.username.localeCompare(b.username);
      case "email":
        return a.email.localeCompare(b.email);
      default:
        // Accounts that requested access before the column existed fall back to
        // when they signed up, which is the closest thing to a request date.
        return compareStamped(
          a,
          b,
          a.submissionRequestedAt ?? a.createdAt,
          b.submissionRequestedAt ?? b.createdAt,
        );
    }
  },
});

// Both outcomes refresh the accounts list as well: approving or refusing
// changes how the account reads in the Directory.
const afterDecision = async () => {
  await Promise.all([refresh(), refreshAccounts()]);
};

function approveUser(id: number) {
  return action.run(`u-approve-${id}`, `/api/admin/users/${id}/approve`, {
    after: afterDecision,
  });
}

function rejectUser(id: number) {
  return action.run(`u-reject-${id}`, `/api/admin/users/${id}/reject`, {
    after: afterDecision,
  });
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <AdminListControls
      v-if="pendingUsers?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search requests"
      id-prefix="upgrades"
    />

    <div v-if="!pendingUsers?.length" class="empty">No accounts pending.</div>
    <div v-else-if="isEmptyFromSearch" class="empty">
      No accounts match “{{ query }}”.
    </div>

    <ul v-else class="simple-list">
      <li v-for="u in visible" :key="u.id" class="simple-row">
        <div class="simple-main">
          <span class="simple-title">
            <UserAttribution
              :user="{ username: u.username, displayName: u.displayName }"
            />
          </span>
          <span class="simple-meta">
            {{ u.email }} · requested
            {{ u.submissionRequestedAt ?? u.createdAt }}
          </span>
        </div>
        <div class="simple-actions">
          <button
            type="button"
            class="btn btn-publish"
            :disabled="action.isRunning(`u-approve-${u.id}`)"
            @click="approveUser(u.id)"
          >
            {{ action.isRunning(`u-approve-${u.id}`) ? "…" : "Approve" }}
          </button>
          <button
            type="button"
            class="btn btn-reject"
            :disabled="action.isRunning(`u-reject-${u.id}`)"
            @click="rejectUser(u.id)"
          >
            {{ action.isRunning(`u-reject-${u.id}`) ? "…" : "Reject" }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
