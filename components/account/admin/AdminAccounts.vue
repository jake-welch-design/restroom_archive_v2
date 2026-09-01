<script setup lang="ts">
import type { AccountRow, AccountSubmission } from "~/types/account";
import { apiErrorMessage } from "~~/shared/utils/apiError";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";
import { isFuture } from "~~/shared/utils/sqliteTime";

/**
 * Account moderation: every account, and everything an admin can do to one.
 *
 * The controls sit behind a Manage toggle rather than on the row, because most
 * of what is here is irreversible and none of it should be one stray click
 * away. Once open, the panel uses the same settings-row idiom as the user's own
 * Profile tab: one labelled row per thing that can change, the current state in
 * the middle, and the single action that changes it on the right. It is the
 * same set of facts seen from the other side.
 *
 * Rows are ordered by consequence, and the irreversible ones sit last under
 * their own heading rather than beside a rename button.
 */
const { user } = useAuth();
const { data: accounts, refresh: refreshAccounts } = useAdminAccounts();
const { refresh: refreshUserQueue } = useUserQueue();

// The list is declared with `immediate: false`, and this component mounts only
// when its section is selected, so mounting is what makes the fetch lazy.
onMounted(() => refreshAccounts());

const action = useAdminAction();

/* --- The Manage panel ----------------------------------------------------- */

const openId = ref<number | null>(null);
const noteToUser = ref("");
const muteDays = ref<number | null>(null);

function toggleOptions(id: number) {
  if (openId.value === id) {
    openId.value = null;
    return;
  }
  openId.value = id;
  noteToUser.value = "";
  muteDays.value = null;
  // A rename left open on another account should not carry over to this one.
  cancelRename();
  // The two disclosures are exclusive, so a row opens to one thing at a time.
  openSubmissionsId.value = null;
}

/* --- Submissions dropdown -------------------------------------------------- */

/**
 * The list behind an account's submission count.
 *
 * The count arrives with the accounts list, so the rows read complete before
 * anything is expanded; the entries themselves are fetched per account on
 * first open and kept, since an admin opening one row usually opens a few.
 */
const openSubmissionsId = ref<number | null>(null);
const loadingSubmissionsId = ref<number | null>(null);
const submissionsError = ref("");
const submissionsByAccount = ref<Record<number, AccountSubmission[]>>({});

async function toggleSubmissions(a: AccountRow) {
  if (openSubmissionsId.value === a.id) {
    openSubmissionsId.value = null;
    return;
  }

  openSubmissionsId.value = a.id;
  openId.value = null;
  submissionsError.value = "";
  if (submissionsByAccount.value[a.id]) return;

  loadingSubmissionsId.value = a.id;
  try {
    submissionsByAccount.value[a.id] = await $fetch<AccountSubmission[]>(
      `/api/admin/users/${a.id}/submissions`,
    );
  } catch (e: unknown) {
    submissionsError.value = apiErrorMessage(e, "Could not load submissions.");
    openSubmissionsId.value = null;
  } finally {
    loadingSubmissionsId.value = null;
  }
}

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting review",
  rejected: "Rejected",
  hidden: "Hidden",
  removed: "Removed",
};

/**
 * Only published and pending entries are in the catalog the viewer reads from,
 * so those are the only ones a link can actually pull up.
 */
function isInArchive(s: AccountSubmission) {
  return s.status === "published" || s.status === "pending";
}

/* --- Status ---------------------------------------------------------------- */

/** The mute column holds an expiry, so a past value means it has lapsed. */
function isMuted(account: AccountRow) {
  return isFuture(account.mutedUntil);
}

function roleLabel(account: AccountRow) {
  if (account.role === "admin") return "Admin";
  if (account.approvedAt) return "Archivist";
  return "Annotator";
}

type Badge = {
  label: string;
  tone: "role" | "neutral" | "warn" | "danger" | "outline";
};

/**
 * Status as separate badges rather than one run-on string.
 *
 * The three facts are different in kind: a role is a standing fact, a
 * suspension or ban is a condition, and a pending upgrade request is a to-do.
 * Read as one sentence they all looked equally urgent.
 */
function badges(account: AccountRow): Badge[] {
  const result: Badge[] = [
    {
      label: roleLabel(account),
      tone: account.role === "admin" || account.approvedAt ? "role" : "neutral",
    },
  ];

  // A ban supersedes a suspension, so only the stronger of the two shows.
  if (account.bannedAt) {
    result.push({ label: "Banned", tone: "danger" });
  } else if (isMuted(account)) {
    result.push({
      label: `Suspended until ${formatDayMonthYear(account.mutedUntil)}`,
      tone: "warn",
    });
  }

  if (
    account.role !== "admin" &&
    !account.approvedAt &&
    account.submissionRequestedAt
  ) {
    result.push({ label: "Access requested", tone: "outline" });
  }

  return result;
}

/* --- Actions --------------------------------------------------------------- */

/**
 * Runs one moderation action against an account.
 *
 * The note from the panel rides along with every action that accepts one, so
 * the change and the explanation the user sees are written together rather
 * than as two requests that could half-fail. Rename and delete are the
 * exceptions, and they call `action.run` directly.
 *
 * Both lists are refreshed: approving or restricting an account changes how it
 * reads here and whether it still belongs in the upgrades queue.
 */
function runAccountAction(
  account: AccountRow,
  verb: string,
  path: string,
  body?: Record<string, unknown>,
) {
  return action.run(
    `acct-${account.id}-${verb}`,
    `/api/admin/users/${account.id}/${path}`,
    {
      body: { message: noteToUser.value || undefined, ...body },
      after: async () => {
        await Promise.all([refreshAccounts(), refreshUserQueue()]);
        openId.value = null;
        noteToUser.value = "";
        muteDays.value = null;
      },
    },
  );
}

const promote = (a: AccountRow) => runAccountAction(a, "promote", "promote");
const grantAccess = (a: AccountRow) => runAccountAction(a, "grant", "approve");
const revokeAccess = (a: AccountRow) =>
  runAccountAction(a, "revoke", "revoke-submission");
const unmute = (a: AccountRow) => runAccountAction(a, "unmute", "unmute");

function mute(a: AccountRow) {
  if (!muteDays.value || muteDays.value < 1) {
    action.error = "Enter how many days the suspension should last.";
    return;
  }
  return runAccountAction(a, "mute", "mute", { days: muteDays.value });
}

function ban(a: AccountRow) {
  const confirmed = confirm(
    `ARE YOU SURE? This will permanently ban @${a.username} and hide all of their submissions.`,
  );
  if (!confirmed) return;
  return runAccountAction(a, "ban", "ban");
}

function remove(a: AccountRow) {
  const confirmed = confirm(
    `Delete @${a.username}? This removes them from the database. Their submissions stay in the archive (unattributed). Their email is NOT blacklisted, so they can sign up again.`,
  );
  if (!confirmed) return;

  // Not through runAccountAction: deletion takes no note, since there is no
  // longer an account to show one on.
  return action.run(`acct-${a.id}-delete`, `/api/admin/users/${a.id}/delete`, {
    fallbackError: "Delete failed.",
    after: async () => {
      await Promise.all([refreshAccounts(), refreshUserQueue()]);
      openId.value = null;
    },
  });
}

/* --- Rename ---------------------------------------------------------------- */

const renamingId = ref<number | null>(null);
const renameDraft = ref("");
const renameError = ref("");

function startRename(a: AccountRow) {
  renamingId.value = a.id;
  renameDraft.value = a.username;
  renameError.value = "";
}

function cancelRename() {
  renamingId.value = null;
  renameError.value = "";
}

async function submitRename(a: AccountRow) {
  const next = renameDraft.value.trim();
  // A no-op rename closes the form rather than making a request.
  if (!next || next === a.username) {
    cancelRename();
    return;
  }

  renameError.value = "";
  const ok = await action.run(
    `acct-${a.id}-rename`,
    `/api/admin/users/${a.id}/rename`,
    { body: { username: next }, after: refreshAccounts },
  );
  if (ok) {
    cancelRename();
  } else {
    // Shown against the field rather than at the top of the panel, since a
    // rename fails for reasons about the value typed.
    renameError.value = action.error;
    action.error = "";
  }
}
</script>

<template>
  <div>
    <p v-if="action.error" class="form-error action-error">
      {{ action.error }}
    </p>
    <p v-if="submissionsError" class="form-error action-error">
      {{ submissionsError }}
    </p>

    <div v-if="!accounts?.length" class="empty">No accounts.</div>

    <ul v-else class="simple-list">
      <li v-for="a in accounts" :key="a.id" class="account-row">
        <div class="simple-row">
          <div class="simple-main">
            <span class="simple-title">
              <UserAttribution
                :user="{ username: a.username, displayName: a.displayName }"
              />
            </span>
            <span class="simple-meta">@{{ a.username }} · {{ a.email }}</span>
            <span class="simple-meta badge-row">
              <span
                v-for="b in badges(a)"
                :key="b.label"
                class="pill"
                :class="`pill-${b.tone}`"
              >
                {{ b.label }}
              </span>
            </span>
            <span v-if="a.adminMessage" class="simple-meta admin-msg-preview">
              “{{ a.adminMessage }}”
            </span>
          </div>

          <div class="simple-actions">
            <button
              v-if="a.submissionCount"
              type="button"
              class="btn"
              :class="{ active: openSubmissionsId === a.id }"
              :aria-expanded="openSubmissionsId === a.id"
              @click="toggleSubmissions(a)"
            >
              {{ a.submissionCount }}
              {{ a.submissionCount === 1 ? "submission" : "submissions" }}
            </button>
            <button
              type="button"
              class="btn"
              :class="{ active: openId === a.id }"
              @click="toggleOptions(a.id)"
            >
              {{ openId === a.id ? "Close" : "Manage" }}
            </button>
          </div>
        </div>

        <div v-if="openSubmissionsId === a.id" class="submissions">
          <div v-if="loadingSubmissionsId === a.id" class="empty">Loading…</div>
          <ul v-else class="submission-list">
            <li
              v-for="s in submissionsByAccount[a.id]"
              :key="s.id"
              class="submission-item"
            >
              <NuxtLink v-if="isInArchive(s)" class="link" :to="`/r/${s.slug}`">
                {{ s.name }}
              </NuxtLink>
              <span v-else>{{ s.name }}</span>
              <span class="dim">{{ s.date }} · {{ s.location }}</span>
              <span v-if="s.status !== 'published'" class="pill pill-neutral">
                {{ SUBMISSION_STATUS_LABEL[s.status] ?? s.status }}
              </span>
            </li>
          </ul>
        </div>

        <div v-if="openId === a.id" class="account-options">
          <label class="field">
            <span class="field-label">Note to user</span>
            <textarea
              v-model="noteToUser"
              class="field-input field-textarea"
              rows="2"
              maxlength="500"
              placeholder="Optional"
            />
            <span class="field-hint">
              Attached to the next action you take below, rename and delete
              excepted. Shown at the top of their account in red.
            </span>
          </label>

          <div class="settings-group">
            <span class="settings-group-label">Access</span>
            <div class="settings-list">
              <div class="settings-row">
                <span class="settings-label">Username</span>

                <template v-if="renamingId !== a.id">
                  <span class="settings-value">@{{ a.username }}</span>
                  <button
                    v-if="a.id !== user?.id"
                    type="button"
                    class="btn settings-change"
                    @click="startRename(a)"
                  >
                    Rename
                  </button>
                </template>

                <form
                  v-else
                  class="settings-edit"
                  @submit.prevent="submitRename(a)"
                >
                  <label class="field">
                    <span class="field-label">New username</span>
                    <input
                      v-model="renameDraft"
                      type="text"
                      minlength="3"
                      maxlength="20"
                      pattern="[a-z0-9_]+"
                      class="field-input"
                      placeholder="new_username"
                    />
                    <span class="field-hint">
                      3–20 lowercase letters, numbers, or underscores.
                    </span>
                  </label>
                  <p v-if="renameError" class="form-error">
                    {{ renameError }}
                  </p>
                  <div class="settings-edit-actions">
                    <button
                      type="submit"
                      class="primary-btn btn-sm"
                      :disabled="action.isRunning(`acct-${a.id}-rename`)"
                    >
                      {{
                        action.isRunning(`acct-${a.id}-rename`) ? "…" : "Save"
                      }}
                    </button>
                    <button
                      type="button"
                      class="link-btn"
                      @click="cancelRename"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>

              <div class="settings-row">
                <span class="settings-label">Role</span>
                <span class="settings-value">{{ roleLabel(a) }}</span>
                <button
                  v-if="a.role !== 'admin'"
                  type="button"
                  class="btn settings-change"
                  :disabled="action.isRunning(`acct-${a.id}-promote`)"
                  @click="promote(a)"
                >
                  {{
                    action.isRunning(`acct-${a.id}-promote`)
                      ? "…"
                      : "Promote to admin"
                  }}
                </button>
                <span v-if="a.role !== 'admin'" class="settings-note">
                  Admins review the queues and moderate accounts. There is no
                  demote action here.
                </span>
              </div>

              <div class="settings-row">
                <span class="settings-label">Submissions</span>
                <span class="settings-value">
                  <template v-if="a.role === 'admin' || a.approvedAt">
                    Can submit scans
                  </template>
                  <template v-else-if="a.submissionRequestedAt">
                    Annotations only, access requested
                  </template>
                  <span v-else class="dim">Annotations only</span>
                </span>

                <template v-if="a.role !== 'admin'">
                  <button
                    v-if="a.approvedAt"
                    type="button"
                    class="btn settings-change"
                    :disabled="action.isRunning(`acct-${a.id}-revoke`)"
                    @click="revokeAccess(a)"
                  >
                    {{
                      action.isRunning(`acct-${a.id}-revoke`)
                        ? "…"
                        : "Revoke access"
                    }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="btn btn-publish settings-change"
                    :disabled="action.isRunning(`acct-${a.id}-grant`)"
                    @click="grantAccess(a)"
                  >
                    {{
                      action.isRunning(`acct-${a.id}-grant`)
                        ? "…"
                        : "Grant access"
                    }}
                  </button>
                </template>
              </div>
            </div>
          </div>

          <!-- The API refuses to suspend, ban or delete an admin, so the whole
               group is theirs not to see. -->
          <div v-if="a.role !== 'admin'" class="settings-group">
            <span class="settings-group-label">
              Restrictions, cannot be undone by the user
            </span>
            <div class="settings-list">
              <div class="settings-row">
                <span class="settings-label">Suspension</span>
                <span class="settings-value">
                  <template v-if="isMuted(a)">
                    Until {{ formatDayMonthYear(a.mutedUntil) }}
                  </template>
                  <span v-else class="dim">Not suspended</span>
                </span>

                <div class="settings-change mod-action">
                  <button
                    v-if="isMuted(a)"
                    type="button"
                    class="btn"
                    :disabled="action.isRunning(`acct-${a.id}-unmute`)"
                    @click="unmute(a)"
                  >
                    {{
                      action.isRunning(`acct-${a.id}-unmute`)
                        ? "…"
                        : "Lift suspension"
                    }}
                  </button>
                  <template v-else>
                    <input
                      v-model.number="muteDays"
                      type="number"
                      min="1"
                      max="3650"
                      class="field-input mute-days"
                      aria-label="Days to suspend"
                      placeholder="days"
                    />
                    <button
                      type="button"
                      class="btn btn-reject"
                      :disabled="action.isRunning(`acct-${a.id}-mute`)"
                      @click="mute(a)"
                    >
                      {{
                        action.isRunning(`acct-${a.id}-mute`) ? "…" : "Suspend"
                      }}
                    </button>
                  </template>
                </div>

                <span v-if="!isMuted(a)" class="settings-note">
                  Blocks annotations and new submissions for the number of days
                  entered. Their account and existing scans stay up.
                </span>
              </div>

              <div class="settings-row settings-row-danger">
                <span class="settings-label">Ban</span>
                <span class="settings-value">
                  <template v-if="a.bannedAt">
                    Banned {{ formatDayMonthYear(a.bannedAt) }}
                  </template>
                  <span v-else class="dim">Not banned</span>
                </span>
                <button
                  v-if="!a.bannedAt"
                  type="button"
                  class="btn btn-reject settings-change"
                  :disabled="action.isRunning(`acct-${a.id}-ban`)"
                  @click="ban(a)"
                >
                  {{ action.isRunning(`acct-${a.id}-ban`) ? "…" : "Ban" }}
                </button>
                <span v-if="!a.bannedAt" class="settings-note">
                  Permanent. Hides every restroom they have submitted from the
                  archive.
                </span>
              </div>

              <div class="settings-row settings-row-danger">
                <span class="settings-label">Delete</span>
                <span class="settings-value dim">
                  Removes the account from the database
                </span>
                <button
                  type="button"
                  class="btn btn-delete settings-change"
                  :disabled="action.isRunning(`acct-${a.id}-delete`)"
                  @click="remove(a)"
                >
                  {{ action.isRunning(`acct-${a.id}-delete`) ? "…" : "Delete" }}
                </button>
                <span class="settings-note">
                  Their published restrooms stay in the archive, unattributed.
                  The email is not blacklisted, so they can sign up again.
                </span>
              </div>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.account-row {
  border-bottom: 1px solid #e8e8e8;
}

/* The row's own divider is the list item's, so the summary inside it does not
   draw a second one. */
.account-row .simple-row {
  border-bottom: 0;
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.admin-msg-preview {
  color: #c33;
  font-style: italic;
}

/* --- Submissions dropdown -------------------------------------------------- */
/* One line per entry: the name links into the archive, the rest is context.
   Deliberately lighter than the Manage panel, since nothing here acts. */

.submissions {
  padding: 0 0 12px;
}

.submission-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.submission-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding: 3px 0;
  font-size: 12px;
}

.submission-item .link {
  color: #000;
  text-decoration: underline;
}

.account-options {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 0 20px;
  /* Same measure as the account's own settings form: this is a form about one
     account, not a full-width table. */
  max-width: 480px;
}

/* A row whose action needs an input beside the button. */
.mod-action {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mute-days {
  width: 68px;
  font-size: 12px;
  padding: 3px 6px;
}
</style>
