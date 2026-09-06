<script setup lang="ts">
/**
 * Every entry that reached the archive, and the way to take one out of it.
 *
 * A browse list rather than a queue: nothing here is waiting to be dealt with,
 * so it carries no badge and is fetched only when the section is first opened.
 * The queues answer "what needs doing"; this answers "what is in the archive",
 * which is the question an admin is asking when a published entry turns out not
 * to belong there.
 *
 * Removal is irreversible — the scan is deleted, not delisted — so it goes
 * through AdminRemovalForm, which insists on a reason and states the
 * consequence, rather than through a `confirm()` that says neither.
 */
import type { ArchiveEntry } from "~/types/account";

const { data: entries, refresh } = useAdminArchive();

// This component mounts only when its section is selected, so mounting is what
// makes the fetch lazy. The list is declared with `immediate: false`.
onMounted(() => refresh());

const { refresh: refreshRemovalQueue } = useRemovalQueue();
const action = useAdminAction();

/* --- Filtering, search and sort -------------------------------------------- */

type StatusFilter = "all" | "published" | "hidden" | "removed";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "hidden", label: "Hidden" },
  { id: "removed", label: "Removed" },
];

// Published first, because a takedown is only ever aimed at a live entry and
// the removed rows are here as a record.
const statusFilter = ref<StatusFilter>("published");

type SortKey = "name" | "location" | "isoDate" | "createdAt" | "submitter";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "isoDate", label: "Scan date" },
  { key: "createdAt", label: "Date added" },
  { key: "submitter", label: "Submitter" },
];

function submitterName(e: ArchiveEntry) {
  return (
    e.submitter?.displayName ||
    e.submitter?.username ||
    ""
  ).toLowerCase();
}

// The status filter is applied before search and sort rather than inside them,
// so the pill counts describe the whole archive while the list below describes
// what the search has left of the selected pill.
const byStatus = computed(() =>
  (entries.value ?? []).filter(
    (e) => statusFilter.value === "all" || e.status === statusFilter.value,
  ),
);

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  ArchiveEntry,
  SortKey
>({
  source: byStatus,
  // Name, place and submitter are the three things an admin has to go on when
  // they arrive here from a report or an email about one specific entry.
  searchFields: (e) => [
    e.name,
    e.location,
    e.submitter?.username,
    e.submitter?.displayName,
  ],
  defaultKey: "name",
  defaultDir: "asc",
  compare: (a, b, key) => {
    switch (key) {
      case "location":
        return a.location.localeCompare(b.location);
      case "isoDate":
        return a.isoDate.localeCompare(b.isoDate) || a.id - b.id;
      case "createdAt":
        return compareStamped(a, b, a.createdAt, b.createdAt);
      case "submitter":
        return (
          submitterName(a).localeCompare(submitterName(b)) ||
          a.name.localeCompare(b.name)
        );
      default:
        return a.name.localeCompare(b.name) || a.id - b.id;
    }
  },
});

function countFor(id: StatusFilter) {
  const all = entries.value ?? [];
  return id === "all" ? all.length : all.filter((e) => e.status === id).length;
}

/* --- Removal -------------------------------------------------------------- */

/** Which row has its reason form open. Only ever one, like the reject form. */
const removingId = ref<number | null>(null);

async function removeEntry(id: number, message: string) {
  const ok = await action.run(
    `arc-remove-${id}`,
    `/api/admin/restrooms/${id}/remove`,
    {
      body: { message },
      after: async () => {
        await Promise.all([
          refresh(),
          // Gone from the public archive, so the catalog everyone else sees is
          // stale. And if the submitter had asked for this takedown themselves,
          // their request has just left the removals queue.
          refreshNuxtData("restrooms"),
          refreshRemovalQueue(),
        ]);
      },
      fallbackError: "Could not remove entry.",
    },
  );
  if (ok) removingId.value = null;
}

/** A removed entry's scan is already gone, so there is nothing left to take. */
function isRemovable(e: ArchiveEntry) {
  return e.status !== "removed";
}

/** How the entry reads to the submitter, which is what an admin needs to know. */
function removalNote(e: ArchiveEntry) {
  if (e.status !== "removed") return null;
  return e.removalRequested ? "Removed at submitter's request" : "Removed";
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <AdminListControls
      v-if="entries?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search the archive"
      id-prefix="archive"
    >
      <template #below>
        <div class="filter-row" role="group" aria-label="Filter by status">
          <button
            v-for="f in STATUS_FILTERS"
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

    <div v-if="!entries?.length" class="empty">Nothing in the archive yet.</div>
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
        :class="{ 'is-hidden': e.status !== 'published' }"
      >
        <div class="simple-main">
          <NuxtLink
            v-if="e.status === 'published'"
            class="simple-title link"
            :to="`/r/${e.slug}`"
          >
            {{ e.name }}
          </NuxtLink>
          <span v-else class="simple-title">{{ e.name }}</span>

          <span class="simple-meta">
            {{ e.date }} · {{ e.location }} ·
            <UserAttribution :user="e.submitter" fallback="deleted user" />
          </span>

          <span v-if="e.status !== 'published'" class="simple-meta">
            <span v-if="e.status === 'hidden'" class="pill pill-hidden">
              Hidden by ban
            </span>
            <span v-else class="pill pill-danger">{{ removalNote(e) }}</span>
          </span>

          <span v-if="e.removalMessage" class="simple-meta reason">
            “{{ e.removalMessage }}”
          </span>

          <AdminRemovalForm
            v-if="removingId === e.id"
            :name="e.name"
            :pending="action.isRunning(`arc-remove-${e.id}`)"
            @cancel="removingId = null"
            @confirm="(message) => removeEntry(e.id, message)"
          />
        </div>

        <div
          v-if="isRemovable(e) && removingId !== e.id"
          class="simple-actions"
        >
          <button
            type="button"
            class="btn btn-reject"
            @click="removingId = e.id"
          >
            Remove
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Sits in the control strip's `below` slot, where the accounts tally sits: a
   qualifier on the search field above it rather than a second toolbar. */
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Dimmed rather than a second colour: the count qualifies the label, it is not
   a badge for a backlog the way the sub-tab counts are. */
.filter-count {
  margin-left: 5px;
  color: #999;
}

.btn-sm.active .filter-count {
  color: inherit;
}
</style>
