<script setup lang="ts">
/**
 * Submissions awaiting review, and the decision on each.
 *
 * The one admin list that is a real backlog: every row here is waiting on
 * somebody, which is why it carries a badge and the browse lists do not.
 *
 * Expanding a row previews its scan in the layout's viewer, which is the only
 * way to judge one. That is driven by the parent, which owns the preview slot;
 * this component only reports which row is open.
 */
import type { PendingRestroom } from "~/types/account";

const props = defineProps<{
  /** Which submission is expanded. Owned by the parent so it can drive the
      viewer, and so leaving the tab can collapse it. */
  expandedId: number | null;
}>();

const emit = defineEmits<{ "update:expandedId": [id: number | null] }>();

const { data: pending, refresh } = useRestroomQueue();
const action = useAdminAction();

type SortKey = "createdAt" | "name" | "location" | "isoDate" | "submitter";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "createdAt", label: "Date submitted" },
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "isoDate", label: "Scan date" },
  { key: "submitter", label: "Submitter" },
];

function submitterName(r: PendingRestroom) {
  return (
    r.submitter?.displayName ||
    r.submitter?.username ||
    ""
  ).toLowerCase();
}

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  PendingRestroom,
  SortKey
>({
  source: pending,
  searchFields: (r) => [
    r.name,
    r.location,
    r.submitter?.username,
    r.submitter?.displayName,
    r.submitter?.email,
  ],
  // Oldest first by default: this is a queue, and the thing waiting longest is
  // the thing to deal with.
  defaultKey: "createdAt",
  defaultDir: "asc",
  compare: (a, b, key) => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name);
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
        return compareStamped(a, b, a.createdAt, b.createdAt);
    }
  },
});

function toggleExpand(id: number) {
  emit("update:expandedId", props.expandedId === id ? null : id);
}

function collapseIfOpen(id: number) {
  if (props.expandedId === id) emit("update:expandedId", null);
}

async function publishRestroom(id: number) {
  await action.run(`r-publish-${id}`, `/api/admin/restrooms/${id}/publish`, {
    after: async () => {
      collapseIfOpen(id);
      await refresh();
      // The entry is now public, so the catalog everyone else sees is stale.
      await refreshNuxtData("restrooms");
    },
  });
}

const rejectingId = ref<number | null>(null);
const rejectMessage = ref("");

function startReject(id: number) {
  rejectingId.value = id;
  rejectMessage.value = "";
}

function cancelReject() {
  rejectingId.value = null;
  rejectMessage.value = "";
}

async function confirmReject(id: number) {
  const message = rejectMessage.value.trim();
  const ok = await action.run(
    `r-reject-${id}`,
    `/api/admin/restrooms/${id}/reject`,
    {
      // The message reaches the submitter, so an empty one is sent as no
      // message rather than as an empty string.
      body: message ? { message } : {},
      after: async () => {
        collapseIfOpen(id);
        await refresh();
      },
    },
  );
  if (ok) cancelReject();
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <AdminListControls
      v-if="pending?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search submissions"
      id-prefix="pending"
    />

    <div v-if="!pending?.length" class="empty">No submissions pending.</div>
    <div v-else-if="isEmptyFromSearch" class="empty">
      No submissions match “{{ query }}”.
    </div>

    <div v-else class="queue">
      <div class="queue-head">
        <span>Name</span>
        <span>Date</span>
        <span>Location</span>
      </div>

      <div v-for="r in visible" :key="r.id" class="queue-row">
        <button
          type="button"
          class="queue-main"
          :class="{ active: props.expandedId === r.id }"
          :aria-expanded="props.expandedId === r.id"
          @click="toggleExpand(r.id)"
        >
          <span class="queue-name">{{ r.name }}</span>
          <span class="queue-cell">{{ r.date }}</span>
          <span class="queue-cell">{{ r.location }}</span>
        </button>

        <div v-if="props.expandedId === r.id" class="queue-expanded">
          <dl class="detail-list">
            <template v-if="r.lat != null && r.lng != null">
              <dt>Coordinates</dt>
              <dd>{{ r.lat.toFixed(4) }}, {{ r.lng.toFixed(4) }}</dd>
            </template>
            <template v-if="r.description">
              <dt>Description</dt>
              <dd class="dd-description">{{ r.description }}</dd>
            </template>
            <template v-if="r.descriptors?.length">
              <dt>Descriptors</dt>
              <dd>
                <span v-for="t in r.descriptors" :key="t" class="admin-tag">
                  {{ t }}
                </span>
              </dd>
            </template>
            <dt>Submitted by</dt>
            <dd>
              <UserAttribution :user="r.submitter" />
              <span v-if="r.submitter?.email" class="dim">
                · {{ r.submitter.email }}
              </span>
            </dd>
            <dt>Submitted at</dt>
            <dd>{{ r.createdAt }}</dd>
          </dl>

          <div v-if="rejectingId === r.id" class="inline-reject-form">
            <textarea
              v-model="rejectMessage"
              class="field-input field-textarea"
              placeholder="Rejection reason (optional)"
              rows="2"
              maxlength="500"
            />
            <div class="inline-actions">
              <button type="button" class="link-btn" @click="cancelReject">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-reject"
                :disabled="action.isRunning(`r-reject-${r.id}`)"
                @click="confirmReject(r.id)"
              >
                {{
                  action.isRunning(`r-reject-${r.id}`) ? "…" : "Confirm reject"
                }}
              </button>
            </div>
          </div>

          <div v-else class="detail-actions">
            <button
              type="button"
              class="btn btn-publish"
              :disabled="action.isRunning(`r-publish-${r.id}`)"
              @click="publishRestroom(r.id)"
            >
              {{ action.isRunning(`r-publish-${r.id}`) ? "…" : "Publish" }}
            </button>
            <button
              type="button"
              class="btn btn-reject"
              @click="startReject(r.id)"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The pending queue borrows the catalog's expand-in-place row, so the admin
   list reads the way the public browse list does. */
.queue {
  display: flex;
  flex-direction: column;
}

.queue-head,
.queue-main {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  text-align: left;
}

.queue-head {
  padding: 0 0 6px;
  border-bottom: 1px solid #000;
  font-size: 12px;
  color: #666;
}

.queue-row {
  border-bottom: 1px solid #e8e8e8;
}

.queue-main {
  width: 100%;
  background: transparent;
  border: 0;
  padding: 8px 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  align-items: start;
}

.queue-main:hover:not(.active) {
  background: #f9f9f9;
}

.queue-cell {
  font-size: 12px;
  color: #666;
}

.queue-expanded {
  padding: 2px 0 12px;
}

.detail-list {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  align-content: start;
}

.detail-list dt {
  color: #666;
  white-space: nowrap;
}

.detail-list dd {
  margin: 0;
  word-break: break-word;
}

.dd-description {
  white-space: pre-wrap;
}

.detail-actions {
  padding-top: 12px;
  display: flex;
  gap: 8px;
}

.inline-reject-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}

/* Location is the least useful column when there is no room for three. */
@container panel (max-width: 560px) {
  .queue-head,
  .queue-main {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .queue-head span:last-child,
  .queue-cell:last-child {
    display: none;
  }
}
</style>
