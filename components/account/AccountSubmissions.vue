<script setup lang="ts">
/**
 * The Submissions tab: making one, and managing the ones already made.
 *
 * Three sections, selected by the sub-tab row the page owns:
 *
 * - New: the wizard for archivists, or the route to becoming one.
 * - Published: entries live in the archive, each with a removal request.
 * - Pending: everything not live, whether awaiting review, turned down, or
 *   taken down on request.
 *
 * The sections are `v-show` rather than `v-if` deliberately. The wizard holds
 * an uploaded scan in memory and hands it to the viewer for preview, and
 * unmounting it to switch sub-tabs would throw that away.
 */
const props = defineProps<{ section: "new" | "published" | "pending" }>();

const { canSubmit, submissionRequested, isAdmin } = useAuth();
const { data: submissions, refresh } = useMySubmissions();
const { refresh: refreshRestroomQueue } = useRestroomQueue();
const action = useAsyncAction();

/**
 * Live in the archive.
 *
 * A pending removal request does not delist an entry, and does not change its
 * status either: the request is recorded in the restroom's
 * `removal_requested_by` column, which the payload surfaces as
 * `removalRequested`. The row stays here until an admin acts on it.
 */
const published = computed(() =>
  (submissions.value ?? []).filter((r) => r.status === "published"),
);

/** Everything not live: awaiting review, turned down, or taken down. */
const inactive = computed(() =>
  (submissions.value ?? []).filter((r) =>
    ["pending", "rejected", "hidden", "removed"].includes(r.status),
  ),
);

const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  pending: "Awaiting review",
  rejected: "Rejected",
  // A hidden entry was rejected after the fact. From the submitter's side the
  // distinction is not meaningful, so it reads the same.
  hidden: "Rejected",
  removed: "Removed at your request",
};

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

/** The row currently acting, so only its own control shows a pending state. */
const busyId = ref<number | null>(null);

/* --- Removal requests ----------------------------------------------------- */

const removalSlug = ref<string | null>(null);
const removalReason = ref("");

function openRemovalForm(slug: string) {
  removalSlug.value = slug;
  removalReason.value = "";
  action.reset();
}

async function submitRemovalRequest(slug: string, id: number) {
  busyId.value = id;
  const ok = await action.run(() =>
    $fetch(`/api/restrooms/${slug}/request-removal`, {
      method: "POST",
      body: { reason: removalReason.value || undefined },
    }),
  );
  busyId.value = null;
  if (!ok) return;
  removalSlug.value = null;
  removalReason.value = "";
  await refresh();
}

/* --- Withdrawing and clearing -------------------------------------------- */

async function dismiss(slug: string, id: number, status: string) {
  const message =
    status === "pending"
      ? "Withdraw this pending submission? This cannot be undone."
      : "Clear this submission from your list?";
  if (!confirm(message)) return;

  busyId.value = id;
  const ok = await action.run(() =>
    $fetch(`/api/restrooms/${slug}`, { method: "DELETE" }),
  );
  busyId.value = null;
  if (ok) await refresh();
}

/**
 * After the wizard publishes or queues a submission, both the user's own list
 * and, for an admin whose submissions skip review, the review queue and the
 * public catalog are out of date.
 */
async function onSubmitted() {
  await refresh();
  if (isAdmin.value) {
    await Promise.all([refreshRestroomQueue(), refreshNuxtData("restrooms")]);
  }
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>

    <div v-show="props.section === 'new'">
      <SubmitWizard v-if="canSubmit" @submitted="onSubmitted" />

      <div v-else-if="submissionRequested" class="awaiting">
        <p>
          Your request to submit restrooms is awaiting admin review. You can
          leave annotations on any restroom in the meantime.
        </p>
      </div>

      <AccountSubmissionAccess v-else />
    </div>

    <div v-show="props.section === 'published'">
      <div v-if="!published.length" class="empty">
        No approved submissions yet.
      </div>
      <ul v-else class="simple-list">
        <li v-for="r in published" :key="r.id" class="simple-row">
          <div class="simple-main">
            <NuxtLink class="simple-title link" :to="`/r/${r.slug}`">
              {{ r.name }}
            </NuxtLink>
            <span class="simple-meta">{{ r.date }} · {{ r.location }}</span>
            <span v-if="r.removalRequested" class="simple-meta">
              Removal requested
            </span>

            <div v-if="removalSlug === r.slug" class="inline-removal-form">
              <textarea
                v-model="removalReason"
                class="field-input field-textarea"
                placeholder="Reason (optional)"
                rows="2"
                maxlength="500"
              />
              <div class="inline-actions">
                <button
                  type="button"
                  class="link-btn"
                  @click="removalSlug = null"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-reject"
                  :disabled="busyId === r.id"
                  @click="submitRemovalRequest(r.slug, r.id)"
                >
                  {{ busyId === r.id ? "…" : "Submit" }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="!r.removalRequested && removalSlug !== r.slug"
            class="simple-actions"
          >
            <button
              type="button"
              class="btn btn-reject"
              @click="openRemovalForm(r.slug)"
            >
              Request removal
            </button>
          </div>
        </li>
      </ul>
    </div>

    <div v-show="props.section === 'pending'">
      <div v-if="!inactive.length" class="empty">Nothing awaiting review.</div>
      <ul v-else class="simple-list">
        <li v-for="r in inactive" :key="r.id" class="simple-row">
          <div class="simple-main">
            <span class="simple-title">{{ r.name }}</span>
            <span class="simple-meta">
              {{ r.date }} · {{ r.location }} · {{ statusLabel(r.status) }}
            </span>
            <span
              v-if="r.status === 'rejected' && r.rejectionMessage"
              class="simple-meta rejection-msg"
            >
              {{ r.rejectionMessage }}
            </span>
          </div>
          <div class="simple-actions">
            <button
              type="button"
              class="icon-btn"
              :disabled="busyId === r.id"
              :title="
                r.status === 'pending'
                  ? 'Withdraw submission'
                  : 'Clear from list'
              "
              @click="dismiss(r.slug, r.id, r.status)"
            >
              {{ busyId === r.id ? "…" : "✕" }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.awaiting {
  border-left: 3px solid #000;
  padding: 8px 12px;
  color: #666;
}

.awaiting p {
  margin: 0;
}

.inline-removal-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  max-width: 420px;
}

.inline-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rejection-msg {
  color: #c33;
}
</style>
