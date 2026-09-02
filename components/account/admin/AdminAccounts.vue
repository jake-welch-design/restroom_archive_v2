<script setup lang="ts">
import type {
  AccountAnnotation,
  AccountRow,
  AccountSubmission,
} from "~/types/account";
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
}

/* --- Search and sort ------------------------------------------------------- */

/**
 * The section's control bar, in the catalog's idiom: a search field and a sort
 * with a direction caret, sitting above the list rather than on it.
 *
 * Unlike the catalog, searching does not replace the sort. A fuzzy search that
 * reorders by relevance is right for browsing an archive; an admin looking up an
 * account is usually narrowing a list they still want ordered by whatever they
 * chose, so this is a plain substring match over the three ways an account is
 * named and the sort stays in force.
 */
type SortKey =
  | "createdAt"
  | "name"
  | "username"
  | "email"
  | "type"
  | "submissionCount"
  | "annotationCount";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "createdAt", label: "Date added" },
  { key: "name", label: "Name" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
  { key: "type", label: "Account type" },
  { key: "submissionCount", label: "Submissions" },
  { key: "annotationCount", label: "Annotations" },
];

const query = ref("");
const sortKey = ref<SortKey>("createdAt");
const sortDir = ref<"asc" | "desc">("asc");

/** An account with no display name is listed under the handle it does have. */
function sortName(a: AccountRow) {
  return (a.displayName || a.username).toLowerCase();
}

function compare(a: AccountRow, b: AccountRow) {
  switch (sortKey.value) {
    case "name":
      return sortName(a).localeCompare(sortName(b));
    case "username":
      return a.username.localeCompare(b.username);
    case "email":
      return a.email.localeCompare(b.email);
    case "type":
      // Ties broken by name, because a type sort on its own leaves every
      // account of one type in whatever order they happened to arrive in.
      return (
        typeRank(a) - typeRank(b) || sortName(a).localeCompare(sortName(b))
      );
    case "submissionCount":
      return a.submissionCount - b.submissionCount;
    case "annotationCount":
      return a.annotationCount - b.annotationCount;
    default:
      // Sqlite datetimes sort correctly as strings. Ties broken by id so the
      // order is stable: accounts created in the same second otherwise shuffle
      // between refreshes.
      return a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
  }
}

const visibleAccounts = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = (accounts.value ?? []).filter((a) => {
    if (!q) return true;
    return (
      a.username.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.displayName ?? "").toLowerCase().includes(q)
    );
  });

  const dir = sortDir.value === "asc" ? 1 : -1;
  return [...list].sort((a, b) => compare(a, b) * dir);
});

/**
 * How the list breaks down by type, under the search field.
 *
 * Counted off the visible list rather than the whole set, so it describes what
 * is actually on screen; with the search empty the two are the same thing.
 * Admins are counted too — they are neither of the other two, and a tally that
 * does not add up to the list above it is worse than a longer one.
 */
const tally = computed(() => {
  const counts: Record<AccountType, number> = {
    Annotator: 0,
    Archivist: 0,
    Admin: 0,
  };
  for (const a of visibleAccounts.value) counts[roleLabel(a)]++;
  return counts;
});

/* --- Submissions and annotations dropdowns --------------------------------- */

/**
 * What each account has submitted and written, behind the same disclosure the
 * catalog uses for a restroom's annotations: a count that is always visible, and
 * a list that is not.
 *
 * The counts arrive with the accounts list, so every row reads complete before
 * anything is expanded; the entries themselves are fetched per account on first
 * open and kept, since an admin opening one row usually opens a few.
 *
 * The two lists are independent — an admin comparing what someone submitted
 * against what they wrote wants both open at once — so this is a factory rather
 * than one shared open-id.
 */
function accountDisclosure<T>(path: string, fallbackError: string) {
  const openId = ref<number | null>(null);
  const loadingId = ref<number | null>(null);
  const error = ref("");
  const byAccount = ref<Record<number, T[]>>({});

  async function toggle(a: AccountRow) {
    if (openId.value === a.id) {
      openId.value = null;
      return;
    }

    openId.value = a.id;
    error.value = "";
    if (byAccount.value[a.id]) return;

    loadingId.value = a.id;
    try {
      byAccount.value[a.id] = (await $fetch(
        `/api/admin/users/${a.id}/${path}`,
      )) as T[];
    } catch (e: unknown) {
      error.value = apiErrorMessage(e, fallbackError);
      openId.value = null;
    } finally {
      loadingId.value = null;
    }
  }

  return { openId, loadingId, error, byAccount, toggle };
}

// Destructured so each stays a top-level ref, which is what lets the template
// read them without `.value`.
const {
  openId: openSubmissionsId,
  loadingId: loadingSubmissionsId,
  error: submissionsError,
  byAccount: submissionsByAccount,
  toggle: toggleSubmissions,
} = accountDisclosure<AccountSubmission>(
  "submissions",
  "Could not load submissions.",
);

const {
  openId: openAnnotationsId,
  loadingId: loadingAnnotationsId,
  error: annotationsError,
  byAccount: annotationsByAccount,
  toggle: toggleAnnotations,
} = accountDisclosure<AccountAnnotation>(
  "annotations",
  "Could not load annotations.",
);

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting review",
  rejected: "Rejected",
  hidden: "Hidden",
  removed: "Removed",
};

/** Published entries need no label; everything else says where it stands. */
function statusSuffix(s: AccountSubmission) {
  if (s.status === "published") return "";
  return ` · ${SUBMISSION_STATUS_LABEL[s.status] ?? s.status}`;
}

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

/**
 * What kind of account this is: the one fact the badges lead with, the tally
 * counts, and the type sort orders by.
 *
 * Not stored anywhere — it is `role` and `approvedAt` read together, which is
 * why every surface that shows it derives it here rather than from a column.
 */
type AccountType = "Admin" | "Archivist" | "Annotator";

function roleLabel(account: AccountRow): AccountType {
  if (account.role === "admin") return "Admin";
  if (account.approvedAt) return "Archivist";
  return "Annotator";
}

/** Least access first, so ascending reads Annotator → Archivist → Admin. */
const TYPE_ORDER: AccountType[] = ["Annotator", "Archivist", "Admin"];

function typeRank(account: AccountRow) {
  return TYPE_ORDER.indexOf(roleLabel(account));
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
    <p v-if="annotationsError" class="form-error action-error">
      {{ annotationsError }}
    </p>

    <div v-if="accounts?.length" class="account-controls">
      <div class="controls-left">
        <label class="search">
          <button
            v-if="query"
            type="button"
            class="search-icon clear"
            aria-label="Clear search"
            @click="query = ''"
          >
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path
                d="M2 2 L10 10 M10 2 L2 10"
                stroke="currentColor"
                stroke-width="1.25"
                fill="none"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <span v-else class="search-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <circle
                cx="5"
                cy="5"
                r="3.25"
                stroke="currentColor"
                stroke-width="1.25"
                fill="none"
              />
              <path
                d="M7.5 7.5 L10.5 10.5"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linecap="round"
              />
            </svg>
          </span>

          <input
            v-model="query"
            type="search"
            placeholder="Search accounts"
            aria-label="Search accounts"
          />
        </label>

        <p class="account-tally">
          Annotators: {{ tally.Annotator }} · Archivists:
          {{ tally.Archivist }} · Admins: {{ tally.Admin }}
        </p>
      </div>

      <div class="sort-control">
        <label class="sort-label" for="account-sort">Sort by</label>
        <select id="account-sort" v-model="sortKey" class="sort-select">
          <option v-for="opt in SORT_OPTIONS" :key="opt.key" :value="opt.key">
            {{ opt.label }}
          </option>
        </select>
        <button
          type="button"
          class="sort-dir"
          :aria-label="
            sortDir === 'asc' ? 'Sorted ascending' : 'Sorted descending'
          "
          :title="sortDir === 'asc' ? 'Ascending' : 'Descending'"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
        >
          <span class="sort-arrow" :class="{ desc: sortDir === 'desc' }">
            ▲
          </span>
        </button>
      </div>
    </div>

    <div v-if="!accounts?.length" class="empty">No accounts.</div>
    <div v-else-if="!visibleAccounts.length" class="empty">
      No accounts match “{{ query }}”.
    </div>

    <ul v-else class="simple-list">
      <li v-for="a in visibleAccounts" :key="a.id" class="account-row">
        <div
          class="simple-row"
          :class="{
            'row-expanded':
              openSubmissionsId === a.id || openAnnotationsId === a.id,
          }"
        >
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

            <div
              v-if="a.submissionCount || a.annotationCount"
              class="disclosures"
            >
              <div class="disclosure-toggles">
                <button
                  v-if="a.submissionCount"
                  type="button"
                  class="disclosure-toggle"
                  :aria-expanded="openSubmissionsId === a.id"
                  @click="toggleSubmissions(a)"
                >
                  Submissions ({{ a.submissionCount }})
                  <span
                    class="toggle-caret"
                    :class="{ open: openSubmissionsId === a.id }"
                  >
                    ›
                  </span>
                </button>

                <button
                  v-if="a.annotationCount"
                  type="button"
                  class="disclosure-toggle"
                  :aria-expanded="openAnnotationsId === a.id"
                  @click="toggleAnnotations(a)"
                >
                  Annotations ({{ a.annotationCount }})
                  <span
                    class="toggle-caret"
                    :class="{ open: openAnnotationsId === a.id }"
                  >
                    ›
                  </span>
                </button>
              </div>

              <template v-if="openSubmissionsId === a.id">
                <p v-if="loadingSubmissionsId === a.id" class="disclosure-note">
                  Loading…
                </p>
                <ul v-else class="disclosure-list thin-scroll">
                  <li
                    v-for="s in submissionsByAccount[a.id]"
                    :key="s.id"
                    class="disclosure-item"
                  >
                    <NuxtLink
                      v-if="isInArchive(s)"
                      class="disclosure-title link"
                      :to="`/r/${s.slug}`"
                    >
                      {{ s.name }}
                    </NuxtLink>
                    <span v-else class="disclosure-title">{{ s.name }}</span>
                    <span class="disclosure-meta">
                      {{ s.date }} · {{ s.location }}{{ statusSuffix(s) }}
                    </span>
                  </li>
                </ul>
              </template>

              <template v-if="openAnnotationsId === a.id">
                <p v-if="loadingAnnotationsId === a.id" class="disclosure-note">
                  Loading…
                </p>
                <ul v-else class="disclosure-list thin-scroll">
                  <li
                    v-for="n in annotationsByAccount[a.id]"
                    :key="n.id"
                    class="disclosure-item"
                    :class="{ 'is-hidden': n.hiddenAt }"
                  >
                    <!-- The annotation's own text leads, because unlike a
                         submission it is the thing being moderated; the restroom
                         it sits on is the context under it. -->
                    <span class="disclosure-title">{{ n.body }}</span>
                    <span class="disclosure-meta">
                      On
                      <NuxtLink class="link" :to="`/r/${n.restroomSlug}`">
                        {{ n.restroomName }}
                      </NuxtLink>
                      · {{ n.createdAt
                      }}<template v-if="n.hiddenAt"> · Hidden</template>
                    </span>
                  </li>
                </ul>
              </template>
            </div>
          </div>

          <div class="simple-actions">
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
/* --- Control bar ----------------------------------------------------------- */
/* The catalog's controls strip, brought down to the account area's type scale:
   an underlined search field and plain text controls with no boxes, so the row
   reads as a set of labels rather than a toolbar competing with the sub-tabs
   directly above it. 12px is the support step the sub-tabs use, which is what
   keeps the two rows reading as one band. */

.account-controls {
  display: flex;
  /* Top-aligned rather than centred: the tally hangs below the search field, and
     centring would push the sort control down to straddle both lines instead of
     sitting on the search's own line. */
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 20px;
  padding-bottom: 12px;
}

.controls-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* A read-out, not a control: the micro step and the muted colour keep it from
   reading as another thing to click. */
.account-tally {
  margin: 0;
  font-size: 11px;
  color: #999;
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #000;
}

.search input {
  border: 0;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  width: 150px;
  background: transparent;
  outline: none;
}

.search-icon {
  display: inline-flex;
  align-items: center;
  color: #000;
}

.search-icon.clear {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.sort-label {
  color: #666;
}

/* Stripped of the native chrome for the same reason the buttons are: this strip
   is text, and a platform select box would be the only raised object on the
   page. The menu it drops is still the native one. */
.sort-select {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #000;
  border-radius: 0;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  color: #000;
  cursor: pointer;
}

.sort-dir {
  display: inline-flex;
  align-items: center;
  background: none;
  border: 0;
  padding: 2px;
  font: inherit;
  color: #000;
  cursor: pointer;
}

/* One caret that turns over, as in the catalog's grid sort: the direction is
   the same fact either way, so it is one control rather than two arrows of
   which one is always inert. */
.sort-arrow {
  display: inline-block;
  font-size: 9px;
  line-height: 1;
  transition: transform 0.15s;
}

.sort-arrow.desc {
  transform: rotate(180deg);
}

@media (hover: hover) {
  .search-icon.clear:hover,
  .sort-dir:hover,
  .sort-select:hover {
    color: #555;
  }
}

/* --- Account rows ---------------------------------------------------------- */

.account-row {
  border-bottom: 1px solid #e8e8e8;
}

/* The row's own divider is the list item's, so the summary inside it does not
   draw a second one. */
.account-row .simple-row {
  border-bottom: 0;
}

/* An open submission list makes the row tall, and a vertically centred Manage
   button then floats away from the account it belongs to. */
.simple-row.row-expanded {
  align-items: flex-start;
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

/* --- Submissions and annotations dropdowns --------------------------------- */
/* The catalog's annotation disclosure, applied to an account: the count reads
   from the collapsed row, and the list opens under it. Nothing here acts, so
   these stay text controls rather than joining the buttons on the right.

   Both toggles share one line, because they are two readings of the same
   question — what has this account put into the archive — and stacking them
   made the row look like it had two unrelated sections. Whichever is open
   expands underneath the pair.

   The rows themselves are the published-submissions format, a linked name over
   one line of context. */

.disclosures {
  margin-top: 4px;
}

.disclosure-toggles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
}

.disclosure-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: #000;
  cursor: pointer;
}

.disclosure-toggle:hover {
  color: #555;
}

.toggle-caret {
  display: inline-block;
  font-size: 12px;
  transform: rotate(0deg);
  transition: transform 0.15s;
}

.toggle-caret.open {
  transform: rotate(90deg);
}

.disclosure-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: #999;
}

/* An account with a hundred entries would otherwise push every account below it
   off the screen, so a long list scrolls in place. */
.disclosure-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
}

.disclosure-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid #e8e8e8;
}

.disclosure-item:last-child {
  border-bottom: 0;
}

/* Same recession the Annotations section gives a hidden row: still legible, so
   the list reads as one sequence rather than two. */
.disclosure-item.is-hidden {
  opacity: 0.55;
}

.disclosure-title {
  font-size: 13px;
  color: #000;
  line-height: 1.3;
}

.disclosure-title.link,
.disclosure-meta .link {
  color: inherit;
  text-decoration: underline;
}

.disclosure-meta {
  font-size: 12px;
  color: #999;
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
