<script setup lang="ts">
/**
 * The four admin queues: work waiting to be cleared.
 *
 * Submissions awaiting review, accounts asking for submission access,
 * annotations someone reported, and submitters asking for their entry to be
 * taken down. These are grouped together because they are the same kind of
 * thing, a backlog with a count, which is why they and not the browse lists
 * carry badges on the Admin tab.
 *
 * Expanding a pending submission previews its scan in the layout's viewer,
 * which is the only way to judge one. That is driven by the parent, which owns
 * the preview slot; this component reports which row is open.
 */
const props = defineProps<{
  section: "submissions" | "upgrades" | "reports" | "removals";
  /** Which submission is expanded. Owned by the parent so it can drive the
      viewer, and so leaving the tab can collapse it. */
  expandedId: number | null;
}>();

const emit = defineEmits<{ "update:expandedId": [id: number | null] }>();

const { data: pendingRestrooms, refresh: refreshRestrooms } =
  useRestroomQueue();
const { data: pendingUsers, refresh: refreshUsers } = useUserQueue();
const { data: reports, refresh: refreshReports } = useAnnotationReports();
const { data: removals, refresh: refreshRemovals } = useRemovalQueue();
const { refresh: refreshAccounts } = useAdminAccounts();

const action = useAdminAction();

function toggleExpand(id: number) {
  emit("update:expandedId", props.expandedId === id ? null : id);
}

function collapseIfOpen(id: number) {
  if (props.expandedId === id) emit("update:expandedId", null);
}

/* --- Submissions ---------------------------------------------------------- */

async function publishRestroom(id: number) {
  await action.run(`r-publish-${id}`, `/api/admin/restrooms/${id}/publish`, {
    after: async () => {
      collapseIfOpen(id);
      await refreshRestrooms();
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
        await refreshRestrooms();
      },
    },
  );
  if (ok) cancelReject();
}

/* --- Upgrades ------------------------------------------------------------- */

// Both outcomes refresh the accounts list as well: approving or refusing
// changes how the account reads in the Accounts section.
const afterUserDecision = async () => {
  await Promise.all([refreshUsers(), refreshAccounts()]);
};

function approveUser(id: number) {
  return action.run(`u-approve-${id}`, `/api/admin/users/${id}/approve`, {
    after: afterUserDecision,
  });
}

function rejectUser(id: number) {
  return action.run(`u-reject-${id}`, `/api/admin/users/${id}/reject`, {
    after: afterUserDecision,
  });
}

/* --- Reports -------------------------------------------------------------- */

function hideAnnotation(id: number) {
  return action.run(`ann-hide-${id}`, `/api/admin/annotations/${id}/hide`, {
    after: refreshReports,
    fallbackError: "Could not hide annotation.",
  });
}

function dismissReports(id: number) {
  return action.run(
    `ann-dismiss-${id}`,
    `/api/admin/annotations/${id}/dismiss-reports`,
    { after: refreshReports, fallbackError: "Could not dismiss reports." },
  );
}

/* --- Removals ------------------------------------------------------------- */

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
      await refreshRemovals();
      await refreshNuxtData("restrooms");
    },
  });
}

/** Turns the request down: the entry stays published, the request leaves. */
function dismissRemoval(id: number) {
  return action.run(
    `rm-dismiss-${id}`,
    `/api/admin/restrooms/${id}/dismiss-removal`,
    { after: refreshRemovals },
  );
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <div v-show="props.section === 'submissions'">
      <div v-if="!pendingRestrooms?.length" class="empty">
        No submissions pending.
      </div>

      <div v-else class="queue">
        <div class="queue-head">
          <span>Name</span>
          <span>Date</span>
          <span>Location</span>
        </div>

        <div v-for="r in pendingRestrooms" :key="r.id" class="queue-row">
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
                    action.isRunning(`r-reject-${r.id}`)
                      ? "…"
                      : "Confirm reject"
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

    <div v-show="props.section === 'upgrades'">
      <div v-if="!pendingUsers?.length" class="empty">No accounts pending.</div>

      <ul v-else class="simple-list">
        <li v-for="u in pendingUsers" :key="u.id" class="simple-row">
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

    <div v-show="props.section === 'reports'">
      <div v-if="!reports?.length" class="empty">No reported annotations.</div>

      <ul v-else class="simple-list">
        <li v-for="r in reports" :key="r.reportId" class="simple-row">
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

    <div v-show="props.section === 'removals'">
      <div v-if="!removals?.length" class="empty">No removal requests.</div>

      <ul v-else class="simple-list">
        <li v-for="r in removals" :key="r.id" class="simple-row">
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
