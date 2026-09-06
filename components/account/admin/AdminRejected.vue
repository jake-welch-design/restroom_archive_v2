<script setup lang="ts">
/**
 * Submissions that were turned down, and the window in which that can be undone.
 *
 * A browse list rather than a queue: nothing here is waiting to be dealt with,
 * and the expected outcome is that nothing happens and the scan expires. It
 * carries no badge and is fetched only when the section is opened.
 *
 * The whole point of the section is the countdown. Rejection keeps the scan for
 * a grace period instead of deleting it on the spot, and this is the only place
 * that says how much of that period is left — so a misjudged rejection is
 * recoverable while an admin can still see that it is.
 *
 * Restoring sends the entry back to the Submissions queue rather than
 * publishing it. That queue is the only thing that previews a scan, which is
 * why this list does not: judging the entry happens there, on the path that
 * already exists.
 */
import type { RejectedSubmission } from "~/types/account";
import {
  REJECTION_GRACE_DAYS,
  formatRejectionCountdown,
  rejectionMsLeft,
} from "~~/shared/utils/rejection";

const { data: entries, refresh } = useAdminRejected();

// This component mounts only when its section is selected, so mounting is what
// makes the fetch lazy. The list is declared with `immediate: false`.
onMounted(() => refresh());

const { refresh: refreshRestroomQueue } = useRestroomQueue();
const action = useAdminAction();

/* --- The clock ------------------------------------------------------------ */

/**
 * A ticking `now`, so a countdown does not go stale in a tab left open.
 *
 * A minute is far finer than the display needs — the coarsest unit shown is an
 * hour — but it is cheap, and it means a row that runs out while an admin is
 * looking at it stops claiming to be restorable.
 */
const nowMs = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;

// Both hooks registered at setup rather than nesting the teardown inside the
// mount callback, where there is no active effect scope for `onScopeDispose` to
// attach to. The interval is client-only by virtue of living in `onMounted`.
onMounted(() => {
  clockTimer = setInterval(() => (nowMs.value = Date.now()), 60_000);
});

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});

/**
 * How the row's remaining time reads.
 *
 * Null for a row that cannot be restored at all: there is no countdown to show
 * on an entry whose scan has already gone, and none to show on one rejected
 * before scans were kept.
 */
function countdown(e: RejectedSubmission) {
  if (!e.restorable) return null;
  const left = rejectionMsLeft(e.rejectedAt, nowMs.value);
  return left == null ? null : formatRejectionCountdown(left);
}

/** Under a day, where the countdown stops being something to ignore. */
function isUrgent(e: RejectedSubmission) {
  if (!e.restorable) return false;
  const left = rejectionMsLeft(e.rejectedAt, nowMs.value);
  return left != null && left > 0 && left < 24 * 60 * 60 * 1000;
}

/** Why a row has no restore button, in the terms the admin needs. */
function goneNote(e: RejectedSubmission) {
  return e.scanPurgedAt
    ? `Scan deleted ${e.scanPurgedAt}`
    : "Scan deleted at rejection";
}

/* --- Filtering, search and sort -------------------------------------------- */

type RejectedFilter = "restorable" | "expired" | "all";

const FILTERS: { id: RejectedFilter; label: string }[] = [
  { id: "restorable", label: "Restorable" },
  { id: "expired", label: "Expired" },
  { id: "all", label: "All" },
];

// Restorable first: it is the only group anything can still be done about, and
// the expired rows are here as a record.
const statusFilter = ref<RejectedFilter>("restorable");

function matchesFilter(e: RejectedSubmission, filter: RejectedFilter) {
  if (filter === "all") return true;
  return filter === "restorable" ? e.restorable : !e.restorable;
}

type SortKey = "rejectedAt" | "name" | "location" | "isoDate" | "submitter";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "rejectedAt", label: "Date rejected" },
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "isoDate", label: "Scan date" },
  { key: "submitter", label: "Submitter" },
];

function submitterName(e: RejectedSubmission) {
  return (
    e.submitter?.displayName ||
    e.submitter?.username ||
    ""
  ).toLowerCase();
}

const byFilter = computed(() =>
  (entries.value ?? []).filter((e) => matchesFilter(e, statusFilter.value)),
);

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  RejectedSubmission,
  SortKey
>({
  source: byFilter,
  searchFields: (e) => [
    e.name,
    e.location,
    e.rejectionMessage,
    e.submitter?.username,
    e.submitter?.displayName,
  ],
  // Most recently rejected first, which is also least time left: the rows worth
  // a second look are the ones that just happened.
  defaultKey: "rejectedAt",
  defaultDir: "desc",
  compare: (a, b, key) => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name) || a.id - b.id;
      case "location":
        return a.location.localeCompare(b.location);
      case "isoDate":
        return a.isoDate.localeCompare(b.isoDate) || a.id - b.id;
      case "submitter":
        return (
          submitterName(a).localeCompare(submitterName(b)) ||
          a.name.localeCompare(b.name)
        );
      default:
        // Entries rejected before the grace period existed have no timestamp;
        // `compareStamped` sorts those to the end, where they belong.
        return compareStamped(a, b, a.rejectedAt, b.rejectedAt);
    }
  },
});

function countFor(id: RejectedFilter) {
  return (entries.value ?? []).filter((e) => matchesFilter(e, id)).length;
}

/* --- Restoring ------------------------------------------------------------ */

async function restore(id: number, name: string) {
  const confirmed = confirm(
    `Put “${name}” back in the submissions queue? Its rejection message is cleared and you can review it again before publishing.`,
  );
  if (!confirmed) return;

  await action.run(`rej-restore-${id}`, `/api/admin/restrooms/${id}/unreject`, {
    after: async () => {
      // It has left this list and joined the pending queue, whose count is a
      // badge on the Admin tab.
      await Promise.all([refresh(), refreshRestroomQueue()]);
    },
    fallbackError: "Could not restore submission.",
  });
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <p class="section-note">
      A rejected scan is kept for {{ REJECTION_GRACE_DAYS }} days before it is
      deleted. Restoring one puts it back in the Submissions queue for review.
    </p>

    <AdminListControls
      v-if="entries?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search rejected"
      id-prefix="rejected"
    >
      <template #below>
        <div class="filter-row" role="group" aria-label="Filter by state">
          <button
            v-for="f in FILTERS"
            :key="f.id"
            type="button"
            class="btn btn-sm"
            :class="{ active: statusFilter === f.id }"
            @click="statusFilter = f.id"
          >
            {{ f.label }}
            <span class="filter-count">{{ countFor(f.id) }}</span>
          </button>
        </div>
      </template>
    </AdminListControls>

    <div v-if="!entries?.length" class="empty">
      Nothing has been rejected yet.
    </div>
    <div v-else-if="isEmptyFromSearch" class="empty">
      No entries match “{{ query }}”.
    </div>
    <div v-else-if="!visible.length" class="empty">
      No entries match that filter.
    </div>

    <ul v-else class="simple-list">
      <li
        v-for="e in visible"
        :key="e.id"
        class="simple-row"
        :class="{ 'is-hidden': !e.restorable }"
      >
        <div class="simple-main">
          <span class="simple-title">{{ e.name }}</span>

          <span class="simple-meta">
            {{ e.date }} · {{ e.location }} ·
            <UserAttribution :user="e.submitter" fallback="deleted user" />
          </span>

          <span class="simple-meta">
            <span
              v-if="countdown(e)"
              class="pill"
              :class="isUrgent(e) ? 'pill-warn' : 'pill-neutral'"
            >
              {{ countdown(e) }}
            </span>
            <span v-else class="pill pill-danger">{{ goneNote(e) }}</span>
            <span v-if="e.rejectedAt" class="dim">
              Rejected {{ e.rejectedAt }}
            </span>
          </span>

          <span v-if="e.rejectionMessage" class="simple-meta reason">
            “{{ e.rejectionMessage }}”
          </span>
        </div>

        <div v-if="e.restorable" class="simple-actions">
          <button
            type="button"
            class="btn btn-publish"
            title="Undo the rejection: the entry returns to the submissions queue"
            :disabled="action.isRunning(`rej-restore-${e.id}`)"
            @click="restore(e.id, e.name)"
          >
            {{ action.isRunning(`rej-restore-${e.id}`) ? "…" : "Restore" }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* The archive's filter strip, which this list is a sibling of: a qualifier
   sitting under the search field rather than a second toolbar. */
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-count {
  margin-left: 5px;
  color: #999;
}

.btn-sm.active .filter-count {
  color: inherit;
}

/* States the retention rule once, at the top, rather than repeating it on
   every row's countdown. */
.section-note {
  margin: 0 0 12px;
  font-size: 12px;
  color: #666;
}
</style>
