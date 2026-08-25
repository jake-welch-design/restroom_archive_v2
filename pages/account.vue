<script setup lang="ts">
import { formatDayMonthYear } from "~~/shared/utils/formatDate";
import { apiErrorMessage } from "~~/shared/utils/apiError";
import type { SubTab } from "~/components/AccountSubTabs.vue";
const {
  user,
  loggedIn,
  canSubmit,
  isAdmin,
  isMuted,
  mutedUntil,
  adminMessage,
  signout,
} = useAuth();
const { previewModelUrl, hasUnsavedSubmission } = useSubmissionPreview();

// This page has no controls strip of its own, so instead of the layout's expand
// tab measuring itself against one, the page's first bordered row grows to meet
// the tab. See useAlignToStrip.
//
// That row is whichever tabs row is mounted: the auth form's when logged out,
// the account tabs when logged in. The auth form exposes its row rather than
// the page reaching into the component for it.
const pageEl = ref<HTMLElement | null>(null);
const authFormRef = ref<{ tabsEl: HTMLElement | null } | null>(null);
const accountTabsEl = ref<HTMLElement | null>(null);
const alignEl = computed(
  () => accountTabsEl.value ?? authFormRef.value?.tabsEl ?? null,
);
const alignStyle = useAlignToStrip(pageEl, alignEl);

// The page keeps these two lists only for the sub-tab counts; the tabs
// themselves render them. Both are keyed fetches, so this shares one request
// with the components rather than issuing a second.
const { data: mySubmissions, refresh: refreshMySubmissions } =
  useMySubmissions();
const { refresh: refreshMyAnnotations } = useMyAnnotations();

const publishedCount = computed(
  () =>
    (mySubmissions.value ?? []).filter(
      (r) => r.status === "published" || r.status === "removal_requested",
    ).length,
);

const inactiveCount = computed(
  () =>
    (mySubmissions.value ?? []).filter((r) =>
      ["pending", "rejected", "hidden", "removed"].includes(r.status),
    ).length,
);

// The lists are fetched with `immediate: false`, so nothing is requested until
// the session resolves and there is a user to fetch them for.
watch(
  loggedIn,
  async (isLoggedIn) => {
    if (isLoggedIn) {
      await Promise.all([refreshMySubmissions(), refreshMyAnnotations()]);
    }
  },
  { immediate: true },
);

// -------------- Admin queues --------------
type PendingRestroom = {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  isoDate: string;
  lat: number | null;
  lng: number | null;
  description: string | null;
  descriptors: string[];
  modelUrl: string;
  createdAt: string;
  submitter: {
    email: string;
    username: string;
    displayName: string | null;
  } | null;
};

type PendingUser = {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  createdAt: string;
  submissionRequestedAt: string | null;
};

type RemovalRequest = {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  status: string;
  removalReason: string | null;
  requester: {
    email: string;
    username: string;
    displayName: string | null;
  } | null;
};

const { data: pendingRestrooms, refresh: refreshRestroomQueue } =
  await useFetch<PendingRestroom[]>("/api/admin/restrooms", {
    server: false,
    immediate: false,
    default: () => [],
  });

const { data: pendingUsers, refresh: refreshUserQueue } = await useFetch<
  PendingUser[]
>("/api/admin/users/pending", {
  server: false,
  immediate: false,
  default: () => [],
});

const { data: removalRequests, refresh: refreshRemovalQueue } = await useFetch<
  RemovalRequest[]
>("/api/admin/restrooms/removals", {
  server: false,
  immediate: false,
  default: () => [],
});

type AnnotationReport = {
  reportId: number;
  reportReason: string | null;
  reportCreatedAt: string;
  annotation: {
    id: number;
    body: string;
    createdAt: string;
    hiddenAt: string | null;
  };
  restroom: { slug: string; name: string };
  reporter: { username: string; displayName: string | null } | null;
  author: { username: string; displayName: string | null } | null;
};

const { data: annotationReports, refresh: refreshAnnotationReports } =
  await useFetch<AnnotationReport[]>("/api/admin/annotations/reports", {
    server: false,
    immediate: false,
    default: () => [],
  });

type AdminAnnotation = {
  id: number;
  body: string;
  createdAt: string;
  hiddenAt: string | null;
  openReportCount: number;
  restroom: { slug: string; name: string; location: string; date: string };
  author: { username: string; displayName: string | null } | null;
};

const { data: allAnnotations, refresh: refreshAllAnnotations } = await useFetch<
  AdminAnnotation[]
>("/api/admin/annotations", {
  server: false,
  immediate: false,
  default: () => [],
});

type AuditLogEntry = {
  id: number;
  action: string;
  targetType: string;
  targetId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: number; username: string; displayName: string | null } | null;
};

const { data: auditLog, refresh: refreshAuditLog } = await useFetch<
  AuditLogEntry[]
>("/api/admin/audit-log", {
  server: false,
  immediate: false,
  default: () => [],
});

watch(
  isAdmin,
  async (v) => {
    if (v) {
      await Promise.all([
        refreshRestroomQueue(),
        refreshUserQueue(),
        refreshRemovalQueue(),
        refreshAnnotationReports(),
      ]);
    }
  },
  { immediate: true },
);

const AUDIT_ACTION_LABEL: Record<string, string> = {
  "user.approve": "approved user",
  "user.reject": "rejected user request",
  "user.ban": "banned user",
  "user.mute": "muted user",
  "user.unmute": "unmuted user",
  "user.promote": "promoted user to admin",
  "user.delete": "deleted user",
  "user.rename": "renamed user",
  "user.revoke-submission": "revoked submission access",
  "restroom.publish": "published restroom",
  "restroom.reject": "rejected restroom",
  "restroom.remove": "removed restroom on request",
  "restroom.dismiss-removal": "dismissed removal request",
  "annotation.hide": "hid annotation",
  "annotation.unhide": "unhid annotation",
  "annotation.dismiss-reports": "dismissed annotation reports",
};

function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

function auditMetadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";
  const parts: string[] = [];
  if (typeof metadata.days === "number") parts.push(`${metadata.days}d`);
  if (typeof metadata.username === "string")
    parts.push(`→ @${metadata.username}`);
  if (typeof metadata.message === "string" && metadata.message)
    parts.push(`"${metadata.message}"`);
  return parts.join(" · ");
}

async function hideReportedAnnotation(annotationId: number) {
  const key = `ann-hide-${annotationId}`;
  actionLoading.value = key;
  actionError.value = "";
  try {
    await $fetch(`/api/admin/annotations/${annotationId}/hide`, {
      method: "POST",
    });
    await refreshAnnotationReports();
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Could not hide annotation.");
  } finally {
    actionLoading.value = null;
  }
}

async function dismissAnnotationReports(annotationId: number) {
  const key = `ann-dismiss-${annotationId}`;
  actionLoading.value = key;
  actionError.value = "";
  try {
    await $fetch(`/api/admin/annotations/${annotationId}/dismiss-reports`, {
      method: "POST",
    });
    await refreshAnnotationReports();
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Could not dismiss reports.");
  } finally {
    actionLoading.value = null;
  }
}

// Hide/unhide from the "All annotations" browse list. Hiding also resolves any
// open reports, so keep the reports queue in sync.
async function hideAnnotation(annotationId: number) {
  actionLoading.value = `ann-hide-${annotationId}`;
  actionError.value = "";
  try {
    await $fetch(`/api/admin/annotations/${annotationId}/hide`, {
      method: "POST",
    });
    await Promise.all([refreshAllAnnotations(), refreshAnnotationReports()]);
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Could not hide annotation.");
  } finally {
    actionLoading.value = null;
  }
}

async function unhideAnnotation(annotationId: number) {
  actionLoading.value = `ann-unhide-${annotationId}`;
  actionError.value = "";
  try {
    await $fetch(`/api/admin/annotations/${annotationId}/unhide`, {
      method: "POST",
    });
    await refreshAllAnnotations();
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Could not unhide annotation.");
  } finally {
    actionLoading.value = null;
  }
}

const actionLoading = ref<string | null>(null);
const actionError = ref("");

async function runAction(key: string, url: string, after: () => Promise<void>) {
  actionLoading.value = key;
  actionError.value = "";
  try {
    await $fetch(url, { method: "POST" });
    await after();
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Action failed.");
  } finally {
    actionLoading.value = null;
  }
}

const publishRestroom = (id: number) =>
  runAction(
    `r-publish-${id}`,
    `/api/admin/restrooms/${id}/publish`,
    async () => {
      if (expandedPendingId.value === id) expandedPendingId.value = null;
      await refreshRestroomQueue();
      await refreshNuxtData("restrooms");
    },
  );
const approveUser = (id: number) =>
  runAction(`u-approve-${id}`, `/api/admin/users/${id}/approve`, async () => {
    await Promise.all([refreshUserQueue(), refreshAccounts()]);
  });
const rejectUser = (id: number) =>
  runAction(`u-reject-${id}`, `/api/admin/users/${id}/reject`, async () => {
    await Promise.all([refreshUserQueue(), refreshAccounts()]);
  });
// Grants the request: the entry comes out of the archive and the scan file is
// deleted. Irreversible, hence the confirm.
function removeRestroom(id: number, name: string) {
  if (
    !confirm(
      `Remove “${name}” from the archive? The scan file is deleted and this cannot be undone.`,
    )
  )
    return;
  return runAction(
    `rm-remove-${id}`,
    `/api/admin/restrooms/${id}/remove`,
    async () => {
      await refreshRemovalQueue();
      await refreshNuxtData("restrooms");
    },
  );
}
// Turns the request down: the entry stays published, the request leaves the queue.
const dismissRemoval = (id: number) =>
  runAction(
    `rm-dismiss-${id}`,
    `/api/admin/restrooms/${id}/dismiss-removal`,
    refreshRemovalQueue,
  );

const rejectingId = ref<number | null>(null);
const rejectMsg = ref("");

async function confirmRejectRestroom(id: number) {
  actionLoading.value = `r-reject-${id}`;
  actionError.value = "";
  try {
    const body = rejectMsg.value.trim()
      ? { message: rejectMsg.value.trim() }
      : {};
    await $fetch(`/api/admin/restrooms/${id}/reject`, { method: "POST", body });
    rejectingId.value = null;
    rejectMsg.value = "";
    if (expandedPendingId.value === id) expandedPendingId.value = null;
    await refreshRestroomQueue();
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Action failed.");
  } finally {
    actionLoading.value = null;
  }
}

const expandedPendingId = ref<number | null>(null);
function togglePendingExpand(id: number) {
  expandedPendingId.value = expandedPendingId.value === id ? null : id;
}

function onPreviewMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin) return;
  const data = e.data as { type?: string } | null;
  if (!data) return;
  if (data.type === "pending-published" || data.type === "pending-rejected") {
    refreshRestroomQueue();
    refreshNuxtData("restrooms");
  }
}
onMounted(() => window.addEventListener("message", onPreviewMessage));
onBeforeUnmount(() => window.removeEventListener("message", onPreviewMessage));

// -------------- Admin: accounts moderation --------------
type AccountRow = {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  submissionRequestedAt: string | null;
  approvedAt: string | null;
  mutedUntil: string | null;
  bannedAt: string | null;
  adminMessage: string | null;
  adminMessageAt: string | null;
  createdAt: string;
};

const { data: accounts, refresh: refreshAccounts } = await useFetch<
  AccountRow[]
>("/api/admin/users", {
  server: false,
  immediate: false,
  default: () => [],
});

watch(
  isAdmin,
  async (v) => {
    if (v) await refreshAccounts();
  },
  { immediate: true },
);

const optionsAccountId = ref<number | null>(null);
const optionsMessage = ref("");
const optionsMuteDays = ref<number | null>(null);

function toggleOptions(id: number) {
  if (optionsAccountId.value === id) {
    optionsAccountId.value = null;
    return;
  }
  optionsAccountId.value = id;
  optionsMessage.value = "";
  optionsMuteDays.value = null;
  // A rename left open on another account shouldn't greet you on this one.
  renamingAccountId.value = null;
  renameError.value = "";
}

function isAccountMuted(account: AccountRow): boolean {
  if (!account.mutedUntil) return false;
  const ms = Date.parse(`${account.mutedUntil.replace(" ", "T")}Z`);
  return Number.isFinite(ms) && ms > Date.now();
}

function accountRoleLabel(account: AccountRow): string {
  if (account.role === "admin") return "Admin";
  if (account.approvedAt) return "Archivist";
  return "Annotator";
}

// Status as separate badges rather than one run-on string: role is a standing
// fact, a suspension or ban is a condition, and a pending upgrade request is a
// to-do. Reading them as one sentence made all three look equally urgent.
type AccountBadge = {
  label: string;
  tone: "role" | "neutral" | "warn" | "danger" | "outline";
};

function accountBadges(account: AccountRow): AccountBadge[] {
  const badges: AccountBadge[] = [
    {
      label: accountRoleLabel(account),
      tone: account.role === "admin" || account.approvedAt ? "role" : "neutral",
    },
  ];
  if (account.bannedAt) {
    badges.push({ label: "Banned", tone: "danger" });
  } else if (isAccountMuted(account)) {
    badges.push({
      label: `Suspended until ${formatDayMonthYear(account.mutedUntil)}`,
      tone: "warn",
    });
  }
  if (
    account.role !== "admin" &&
    !account.approvedAt &&
    account.submissionRequestedAt
  ) {
    badges.push({ label: "Access requested", tone: "outline" });
  }
  return badges;
}

async function runAccountAction(
  account: AccountRow,
  key: string,
  url: string,
  body?: Record<string, unknown>,
) {
  const fullKey = `acct-${account.id}-${key}`;
  actionLoading.value = fullKey;
  actionError.value = "";
  try {
    await $fetch(url, {
      method: "POST",
      body: { message: optionsMessage.value || undefined, ...body },
    });
    await refreshAccounts();
    await refreshUserQueue();
    optionsAccountId.value = null;
    optionsMessage.value = "";
    optionsMuteDays.value = null;
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Action failed.");
  } finally {
    actionLoading.value = null;
  }
}

function promoteAccount(a: AccountRow) {
  return runAccountAction(a, "promote", `/api/admin/users/${a.id}/promote`);
}
function revokeSubmissionAccess(a: AccountRow) {
  return runAccountAction(
    a,
    "revoke",
    `/api/admin/users/${a.id}/revoke-submission`,
  );
}
function grantSubmissionAccess(a: AccountRow) {
  return runAccountAction(a, "grant", `/api/admin/users/${a.id}/approve`);
}
function muteAccount(a: AccountRow) {
  if (!optionsMuteDays.value || optionsMuteDays.value < 1) {
    actionError.value = "Enter how many days the suspension should last.";
    return Promise.resolve();
  }
  return runAccountAction(a, "mute", `/api/admin/users/${a.id}/mute`, {
    days: optionsMuteDays.value,
  });
}
function unmuteAccount(a: AccountRow) {
  return runAccountAction(a, "unmute", `/api/admin/users/${a.id}/unmute`);
}
function banAccount(a: AccountRow) {
  if (
    !confirm(
      `ARE YOU SURE? This will permanently ban @${a.username} and hide all of their submissions.`,
    )
  )
    return;
  return runAccountAction(a, "ban", `/api/admin/users/${a.id}/ban`);
}
async function deleteAccount(a: AccountRow) {
  if (
    !confirm(
      `Delete @${a.username}? This removes them from the database. Their submissions stay in the archive (unattributed). Their email is NOT blacklisted — they can sign up again.`,
    )
  )
    return;
  const fullKey = `acct-${a.id}-delete`;
  actionLoading.value = fullKey;
  actionError.value = "";
  try {
    await $fetch(`/api/admin/users/${a.id}/delete`, { method: "POST" });
    await refreshAccounts();
    await refreshUserQueue();
    optionsAccountId.value = null;
  } catch (e: unknown) {
    actionError.value = apiErrorMessage(e, "Delete failed.");
  } finally {
    actionLoading.value = null;
  }
}

// -------------- Admin: rename username --------------
const renamingAccountId = ref<number | null>(null);
const renameDraft = ref("");
const renameError = ref("");

function startRename(a: AccountRow) {
  renamingAccountId.value = a.id;
  renameDraft.value = a.username;
  renameError.value = "";
}

async function submitRename(a: AccountRow) {
  const next = renameDraft.value.trim();
  if (!next || next === a.username) {
    renamingAccountId.value = null;
    return;
  }
  actionLoading.value = `acct-${a.id}-rename`;
  renameError.value = "";
  try {
    await $fetch(`/api/admin/users/${a.id}/rename`, {
      method: "POST",
      body: { username: next },
    });
    renamingAccountId.value = null;
    await refreshAccounts();
  } catch (e: unknown) {
    renameError.value = apiErrorMessage(e, "Rename failed.");
  } finally {
    actionLoading.value = null;
  }
}

const roleLabel = computed(() => {
  if (!user.value) return "";
  if (isAdmin.value) return "Admin";
  if (canSubmit.value) return "Archivist";
  return "Annotator";
});

// -------------- Account tabs --------------
type AccountTab = "admin" | "profile" | "submissions" | "annotations";
const route = useRoute();
const router = useRouter();

function isValidTab(v: unknown): v is AccountTab {
  return (
    v === "profile" ||
    v === "submissions" ||
    v === "annotations" ||
    (v === "admin" && isAdmin.value)
  );
}

const accountTab = ref<AccountTab>(
  isValidTab(route.query.tab) ? route.query.tab : "profile",
);

const LEAVE_SUBMISSION_WARNING =
  "Leaving will lose your in-progress submission. Continue?";

function setTab(tab: AccountTab) {
  if (
    accountTab.value === "submissions" &&
    tab !== "submissions" &&
    hasUnsavedSubmission.value &&
    !confirm(LEAVE_SUBMISSION_WARNING)
  ) {
    return;
  }
  accountTab.value = tab;
  // Re-point `?section=` at the new tab's own sub-tab (dropping it for tabs
  // that have none) so the URL never advertises a section the tab can't show.
  const { section: _stale, ...query } = route.query;
  const section =
    tab === "admin"
      ? adminSection.value
      : tab === "submissions"
        ? submissionsSection.value
        : undefined;
  router.replace({
    query: section ? { ...query, tab, section } : { ...query, tab },
  });
}

// Warn before navigating away from the account page entirely (nav links,
// browser back/forward, programmatic navigateTo) while a scan is loaded.
onBeforeRouteLeave(() => {
  if (hasUnsavedSubmission.value && !confirm(LEAVE_SUBMISSION_WARNING)) {
    return false;
  }
});

// Expanding a pending submission auto-previews its scan in the same
// right-panel viewer the submission wizard uses — no separate "preview"
// button. Not treated as "unsaved progress": it's read-only, so leaving
// doesn't need a confirm.
watch(expandedPendingId, (id) => {
  const r =
    id == null ? null : pendingRestrooms.value?.find((p) => p.id === id);
  previewModelUrl.value = r?.modelUrl ?? null;
});

// Leaving the Admin tab should collapse any expanded preview rather than
// leave it orphaned in the viewer with no visible expanded row to match it.
watch(accountTab, (tab) => {
  if (tab !== "admin") expandedPendingId.value = null;
});

// The session resolves client-side, so `?tab=admin` looks invalid on first
// render; re-apply it once admin status is known.
watch(isAdmin, (v) => {
  if (v && route.query.tab === "admin") accountTab.value = "admin";
});

// Only the Review queues carry an actionable badge on the Admin tab.
const adminQueueCount = computed(
  () =>
    (pendingRestrooms.value?.length ?? 0) +
    (pendingUsers.value?.length ?? 0) +
    (annotationReports.value?.length ?? 0) +
    (removalRequests.value?.length ?? 0),
);

// -------------- Sub-tabs --------------
// Each main tab owns at most one row of sub-tabs; both share the `?section=`
// query param so a queue can be linked to and survives a reload.
type AdminSection =
  | "submissions"
  | "upgrades"
  | "reports"
  | "removals"
  | "accounts"
  | "annotations"
  | "audit";
type SubmissionsSection = "new" | "published" | "pending";

const ADMIN_SECTIONS: AdminSection[] = [
  "submissions",
  "upgrades",
  "reports",
  "removals",
  "accounts",
  "annotations",
  "audit",
];
const SUBMISSIONS_SECTIONS: SubmissionsSection[] = [
  "new",
  "published",
  "pending",
];

const adminSection = ref<AdminSection>("submissions");
const submissionsSection = ref<SubmissionsSection>("new");

const adminSubTabs = computed<SubTab[]>(() => [
  {
    id: "submissions",
    label: "Submissions",
    count: pendingRestrooms.value?.length ?? 0,
  },
  { id: "upgrades", label: "Upgrades", count: pendingUsers.value?.length ?? 0 },
  {
    id: "reports",
    label: "Reports",
    count: annotationReports.value?.length ?? 0,
  },
  {
    id: "removals",
    label: "Removals",
    count: removalRequests.value?.length ?? 0,
  },
  { id: "accounts", label: "Accounts", gapBefore: true },
  { id: "annotations", label: "Annotations" },
  { id: "audit", label: "Audit" },
]);

const submissionsSubTabs = computed<SubTab[]>(() => [
  { id: "new", label: "New" },
  {
    id: "published",
    label: "Published",
    count: publishedCount.value,
  },
  {
    id: "pending",
    label: "Pending",
    count: inactiveCount.value,
  },
]);

// The section for whichever main tab is showing, so one <AccountSubTabs>
// v-model and one URL param cover both rows.
const activeSection = computed({
  get: () =>
    accountTab.value === "admin"
      ? adminSection.value
      : submissionsSection.value,
  set: (v: string) => setSection(v),
});

const activeSubTabs = computed(() => {
  if (accountTab.value === "admin" && isAdmin.value) return adminSubTabs.value;
  if (accountTab.value === "submissions") return submissionsSubTabs.value;
  return [];
});

function setSection(section: string) {
  if (accountTab.value === "admin") {
    if (!ADMIN_SECTIONS.includes(section as AdminSection)) return;
    adminSection.value = section as AdminSection;
  } else if (accountTab.value === "submissions") {
    if (!SUBMISSIONS_SECTIONS.includes(section as SubmissionsSection)) return;
    // No unsaved-work guard here: the sub-tab panels are v-show, so the wizard
    // stays mounted and an in-progress scan survives the switch. Only leaving
    // the Submissions tab entirely (setTab) unmounts it.
    submissionsSection.value = section as SubmissionsSection;
  } else {
    return;
  }
  router.replace({ query: { ...route.query, section } });
}

// Restore `?section=` for whichever tab is active. Runs on mount and again
// when `isAdmin` resolves client-side (same reason `?tab=admin` is re-applied).
function applySectionFromQuery() {
  const section = route.query.section;
  if (typeof section !== "string") return;
  if (
    accountTab.value === "admin" &&
    ADMIN_SECTIONS.includes(section as AdminSection)
  ) {
    adminSection.value = section as AdminSection;
  } else if (
    accountTab.value === "submissions" &&
    SUBMISSIONS_SECTIONS.includes(section as SubmissionsSection)
  ) {
    submissionsSection.value = section as SubmissionsSection;
  }
}
applySectionFromQuery();

// The two large admin lists are fetched the first time their section is opened.
const loadedSections = reactive(new Set<AdminSection>());
watch(
  [isAdmin, accountTab, adminSection],
  async () => {
    if (!isAdmin.value || accountTab.value !== "admin") return;
    const section = adminSection.value;
    if (loadedSections.has(section)) return;
    if (section === "annotations") {
      loadedSections.add(section);
      await refreshAllAnnotations();
    } else if (section === "audit") {
      loadedSections.add(section);
      await refreshAuditLog();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div ref="pageEl" class="account-page" :style="alignStyle">
    <CatalogHeader />

    <AccountAuthForm v-if="!loggedIn" ref="authFormRef" />

    <!-- Logged-in -->
    <div v-else class="body-section thin-scroll">
      <div v-if="adminMessage" class="admin-message-banner">
        <strong>From admin:</strong> {{ adminMessage }}
      </div>

      <!-- Top row sits where the catalog's search bar does: left-clustered,
           no border, flush under the site header — like `.controls`. Sign out
           sits on the right, same line, like it used to. -->
      <header class="account-header">
        <div class="account-identity">
          <span v-if="roleLabel" class="account-role">{{ roleLabel }}</span>
          <UserAttribution
            v-if="user"
            class="account-email"
            :user="{
              username: user.username,
              displayName: user.displayName,
            }"
          />
        </div>
        <button type="button" class="link-btn" @click="signout">
          Sign out
        </button>
      </header>

      <!-- Bottom row is what the expand tab frames — same band position, and
           same flat/color-only styling, as the Info page's tabs. -->
      <nav ref="accountTabsEl" class="account-tabs" role="tablist">
        <button
          v-if="isAdmin"
          type="button"
          class="tab-btn"
          role="tab"
          :class="{ active: accountTab === 'admin' }"
          :aria-selected="accountTab === 'admin'"
          @click="setTab('admin')"
        >
          Admin
          <span v-if="adminQueueCount" class="count">{{
            adminQueueCount
          }}</span>
        </button>
        <button
          type="button"
          class="tab-btn"
          role="tab"
          :class="{ active: accountTab === 'profile' }"
          :aria-selected="accountTab === 'profile'"
          @click="setTab('profile')"
        >
          Profile
        </button>
        <button
          type="button"
          class="tab-btn"
          role="tab"
          :class="{ active: accountTab === 'submissions' }"
          :aria-selected="accountTab === 'submissions'"
          @click="setTab('submissions')"
        >
          Submissions
        </button>
        <button
          type="button"
          class="tab-btn"
          role="tab"
          :class="{ active: accountTab === 'annotations' }"
          :aria-selected="accountTab === 'annotations'"
          @click="setTab('annotations')"
        >
          Annotations
        </button>
      </nav>

      <div v-if="isMuted" class="awaiting muted-banner">
        <p>
          Your account is muted until {{ mutedUntil }}. You can't post
          annotations or submit restrooms during this period.
        </p>
      </div>

      <AccountSubTabs
        v-if="activeSubTabs.length"
        v-model="activeSection"
        :tabs="activeSubTabs"
      />

      <!-- Profile -->
      <div v-if="accountTab === 'profile'" class="tab-panel" role="tabpanel">
        <AccountProfile />
      </div>

      <div
        v-if="accountTab === 'submissions'"
        class="tab-panel"
        role="tabpanel"
      >
        <AccountSubmissions :section="submissionsSection" />
      </div>

      <div
        v-if="accountTab === 'annotations'"
        class="tab-panel"
        role="tabpanel"
      >
        <AccountAnnotations />
      </div>

      <!-- Admin -->
      <div
        v-if="isAdmin && accountTab === 'admin'"
        class="tab-panel"
        role="tabpanel"
      >
        <p v-if="actionError" class="form-error action-error">
          {{ actionError }}
        </p>

        <!-- Pending submissions -->
        <div v-show="adminSection === 'submissions'">
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
                :class="{ active: expandedPendingId === r.id }"
                :aria-expanded="expandedPendingId === r.id"
                @click="togglePendingExpand(r.id)"
              >
                <span class="queue-name">{{ r.name }}</span>
                <span class="queue-cell">{{ r.date }}</span>
                <span class="queue-cell">{{ r.location }}</span>
              </button>

              <div v-if="expandedPendingId === r.id" class="queue-expanded">
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
                      <span
                        v-for="t in r.descriptors"
                        :key="t"
                        class="admin-tag"
                        >{{ t }}</span
                      >
                    </dd>
                  </template>
                  <dt>Submitted by</dt>
                  <dd>
                    <UserAttribution :user="r.submitter" />
                    <span v-if="r.submitter?.email" class="dim">
                      · {{ r.submitter.email }}</span
                    >
                  </dd>
                  <dt>Submitted at</dt>
                  <dd>{{ r.createdAt }}</dd>
                </dl>
                <template v-if="rejectingId === r.id">
                  <div class="inline-reject-form">
                    <textarea
                      v-model="rejectMsg"
                      class="field-input field-textarea"
                      placeholder="Rejection reason (optional)"
                      rows="2"
                      maxlength="500"
                    />
                    <div class="inline-actions">
                      <button
                        type="button"
                        class="link-btn"
                        @click="
                          rejectingId = null;
                          rejectMsg = '';
                        "
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn btn-reject"
                        :disabled="actionLoading === `r-reject-${r.id}`"
                        @click="confirmRejectRestroom(r.id)"
                      >
                        {{
                          actionLoading === `r-reject-${r.id}`
                            ? "…"
                            : "Confirm reject"
                        }}
                      </button>
                    </div>
                  </div>
                </template>
                <div v-else class="detail-actions">
                  <button
                    type="button"
                    class="btn btn-publish"
                    :disabled="actionLoading === `r-publish-${r.id}`"
                    @click="publishRestroom(r.id)"
                  >
                    {{
                      actionLoading === `r-publish-${r.id}` ? "…" : "Publish"
                    }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-reject"
                    @click="
                      rejectingId = r.id;
                      rejectMsg = '';
                    "
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pending upgrades -->
        <div v-show="adminSection === 'upgrades'">
          <div v-if="!pendingUsers?.length" class="empty">
            No accounts pending.
          </div>

          <ul v-else class="simple-list">
            <li v-for="u in pendingUsers" :key="u.id" class="simple-row">
              <div class="simple-main">
                <span class="simple-title">
                  <UserAttribution
                    :user="{ username: u.username, displayName: u.displayName }"
                  />
                </span>
                <span class="simple-meta"
                  >{{ u.email }} · requested
                  {{ u.submissionRequestedAt ?? u.createdAt }}</span
                >
              </div>
              <div class="simple-actions">
                <button
                  type="button"
                  class="btn btn-publish"
                  :disabled="actionLoading === `u-approve-${u.id}`"
                  @click="approveUser(u.id)"
                >
                  {{ actionLoading === `u-approve-${u.id}` ? "…" : "Approve" }}
                </button>
                <button
                  type="button"
                  class="btn btn-reject"
                  :disabled="actionLoading === `u-reject-${u.id}`"
                  @click="rejectUser(u.id)"
                >
                  {{ actionLoading === `u-reject-${u.id}` ? "…" : "Reject" }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Reported annotations -->
        <div v-show="adminSection === 'reports'">
          <div v-if="!annotationReports?.length" class="empty">
            No reported annotations.
          </div>

          <ul v-else class="simple-list">
            <li
              v-for="r in annotationReports"
              :key="r.reportId"
              class="simple-row"
            >
              <div class="simple-main">
                <NuxtLink
                  class="simple-title link"
                  :to="`/r/${r.restroom.slug}`"
                >
                  {{ r.restroom.name }}
                </NuxtLink>
                <span class="simple-meta annotation-body">{{
                  r.annotation.body
                }}</span>
                <span class="simple-meta">
                  By
                  <UserAttribution :user="r.author" fallback="unknown" />
                  · reported by
                  <UserAttribution :user="r.reporter" fallback="unknown" />
                  · {{ r.reportCreatedAt }}
                </span>
                <span v-if="r.reportReason" class="simple-meta reason"
                  >Reason: {{ r.reportReason }}</span
                >
                <span v-if="r.annotation.hiddenAt" class="simple-meta dim"
                  >Already hidden ({{ r.annotation.hiddenAt }})</span
                >
              </div>
              <div class="simple-actions">
                <button
                  v-if="!r.annotation.hiddenAt"
                  type="button"
                  class="btn btn-reject"
                  :disabled="actionLoading === `ann-hide-${r.annotation.id}`"
                  @click="hideReportedAnnotation(r.annotation.id)"
                >
                  {{
                    actionLoading === `ann-hide-${r.annotation.id}`
                      ? "…"
                      : "Hide annotation"
                  }}
                </button>
                <button
                  type="button"
                  class="btn"
                  :disabled="actionLoading === `ann-dismiss-${r.annotation.id}`"
                  @click="dismissAnnotationReports(r.annotation.id)"
                >
                  {{
                    actionLoading === `ann-dismiss-${r.annotation.id}`
                      ? "…"
                      : "Dismiss"
                  }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Removal requests -->
        <div v-show="adminSection === 'removals'">
          <div v-if="!removalRequests?.length" class="empty">
            No removal requests.
          </div>

          <ul v-else class="simple-list">
            <li v-for="r in removalRequests" :key="r.id" class="simple-row">
              <div class="simple-main">
                <span class="simple-title">{{ r.name }}</span>
                <span class="simple-meta"
                  >{{ r.date }} · {{ r.location }} · status:
                  {{ r.status }}</span
                >
                <span v-if="r.removalReason" class="simple-meta reason"
                  >Reason: {{ r.removalReason }}</span
                >
                <span class="simple-meta">
                  Requested by
                  <UserAttribution :user="r.requester" fallback="unknown" />
                </span>
              </div>
              <div class="simple-actions">
                <button
                  type="button"
                  class="btn btn-reject"
                  title="Grant the request — take the entry out of the archive"
                  :disabled="actionLoading === `rm-remove-${r.id}`"
                  @click="removeRestroom(r.id, r.name)"
                >
                  {{ actionLoading === `rm-remove-${r.id}` ? "…" : "Remove" }}
                </button>
                <button
                  type="button"
                  class="btn"
                  title="Turn the request down — the entry stays published"
                  :disabled="actionLoading === `rm-dismiss-${r.id}`"
                  @click="dismissRemoval(r.id)"
                >
                  {{ actionLoading === `rm-dismiss-${r.id}` ? "…" : "Dismiss" }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Accounts -->
        <div v-show="adminSection === 'accounts'">
          <div v-if="!accounts?.length" class="empty">No accounts.</div>

          <ul v-else class="simple-list">
            <li v-for="a in accounts" :key="a.id" class="account-row">
              <div class="simple-row">
                <div class="simple-main">
                  <span class="simple-title">
                    <UserAttribution
                      :user="{
                        username: a.username,
                        displayName: a.displayName,
                      }"
                    />
                  </span>
                  <span class="simple-meta"
                    >@{{ a.username }} · {{ a.email }}</span
                  >
                  <span class="simple-meta badge-row">
                    <span
                      v-for="b in accountBadges(a)"
                      :key="b.label"
                      class="pill"
                      :class="`pill-${b.tone}`"
                      >{{ b.label }}</span
                    >
                  </span>
                  <span
                    v-if="a.adminMessage"
                    class="simple-meta admin-msg-preview"
                    >“{{ a.adminMessage }}”</span
                  >
                </div>
                <div class="simple-actions">
                  <button
                    type="button"
                    class="btn"
                    :class="{ active: optionsAccountId === a.id }"
                    @click="toggleOptions(a.id)"
                  >
                    {{ optionsAccountId === a.id ? "Close" : "Manage" }}
                  </button>
                </div>
              </div>

              <!-- Same settings-row idiom as the Profile tab: one labelled row
                   per thing you can change, current state in the middle, the
                   single action that changes it on the right. Ordered by
                   consequence, so the irreversible ones sit last under their
                   own heading instead of beside a rename button. -->
              <div v-if="optionsAccountId === a.id" class="account-options">
                <label class="field">
                  <span class="field-label">Note to user</span>
                  <textarea
                    v-model="optionsMessage"
                    class="field-input field-textarea"
                    rows="2"
                    maxlength="500"
                    placeholder="Optional"
                  />
                  <span class="field-hint">
                    Attached to the next action you take below — rename and
                    delete excepted. Shown at the top of their account in red.
                  </span>
                </label>

                <div class="settings-group">
                  <span class="settings-group-label">Access</span>
                  <div class="settings-list">
                    <!-- Username -->
                    <div class="settings-row">
                      <span class="settings-label">Username</span>
                      <template v-if="renamingAccountId !== a.id">
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
                          <span class="field-hint"
                            >3–20 lowercase letters, numbers, or
                            underscores.</span
                          >
                        </label>
                        <p v-if="renameError" class="form-error">
                          {{ renameError }}
                        </p>
                        <div class="settings-edit-actions">
                          <button
                            type="submit"
                            class="primary-btn btn-sm"
                            :disabled="actionLoading === `acct-${a.id}-rename`"
                          >
                            {{
                              actionLoading === `acct-${a.id}-rename`
                                ? "…"
                                : "Save"
                            }}
                          </button>
                          <button
                            type="button"
                            class="link-btn"
                            @click="renamingAccountId = null"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>

                    <!-- Role -->
                    <div class="settings-row">
                      <span class="settings-label">Role</span>
                      <span class="settings-value">{{
                        accountRoleLabel(a)
                      }}</span>
                      <button
                        v-if="a.role !== 'admin'"
                        type="button"
                        class="btn settings-change"
                        :disabled="actionLoading === `acct-${a.id}-promote`"
                        @click="promoteAccount(a)"
                      >
                        {{
                          actionLoading === `acct-${a.id}-promote`
                            ? "…"
                            : "Promote to admin"
                        }}
                      </button>
                      <span v-if="a.role !== 'admin'" class="settings-note">
                        Admins review the queues and moderate accounts. There's
                        no demote action here.
                      </span>
                    </div>

                    <!-- Submission access -->
                    <div class="settings-row">
                      <span class="settings-label">Submissions</span>
                      <span class="settings-value">
                        <template v-if="a.role === 'admin' || a.approvedAt"
                          >Can submit scans</template
                        >
                        <template v-else-if="a.submissionRequestedAt"
                          >Annotations only — access requested</template
                        >
                        <span v-else class="dim">Annotations only</span>
                      </span>
                      <template v-if="a.role !== 'admin'">
                        <button
                          v-if="a.approvedAt"
                          type="button"
                          class="btn settings-change"
                          :disabled="actionLoading === `acct-${a.id}-revoke`"
                          @click="revokeSubmissionAccess(a)"
                        >
                          {{
                            actionLoading === `acct-${a.id}-revoke`
                              ? "…"
                              : "Revoke access"
                          }}
                        </button>
                        <button
                          v-else
                          type="button"
                          class="btn btn-publish settings-change"
                          :disabled="actionLoading === `acct-${a.id}-grant`"
                          @click="grantSubmissionAccess(a)"
                        >
                          {{
                            actionLoading === `acct-${a.id}-grant`
                              ? "…"
                              : "Grant access"
                          }}
                        </button>
                      </template>
                    </div>
                  </div>
                </div>

                <!-- Admins can't be suspended, banned, or deleted (the API
                     refuses), so the whole group is theirs to not see. -->
                <div v-if="a.role !== 'admin'" class="settings-group">
                  <span class="settings-group-label"
                    >Restrictions — cannot be undone by the user</span
                  >
                  <div class="settings-list">
                    <!-- Suspension -->
                    <div class="settings-row">
                      <span class="settings-label">Suspension</span>
                      <span class="settings-value">
                        <template v-if="isAccountMuted(a)"
                          >Until
                          {{ formatDayMonthYear(a.mutedUntil) }}</template
                        >
                        <span v-else class="dim">Not suspended</span>
                      </span>
                      <div class="settings-change mod-action">
                        <button
                          v-if="isAccountMuted(a)"
                          type="button"
                          class="btn"
                          :disabled="actionLoading === `acct-${a.id}-unmute`"
                          @click="unmuteAccount(a)"
                        >
                          {{
                            actionLoading === `acct-${a.id}-unmute`
                              ? "…"
                              : "Lift suspension"
                          }}
                        </button>
                        <template v-else>
                          <input
                            v-model.number="optionsMuteDays"
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
                            :disabled="actionLoading === `acct-${a.id}-mute`"
                            @click="muteAccount(a)"
                          >
                            {{
                              actionLoading === `acct-${a.id}-mute`
                                ? "…"
                                : "Suspend"
                            }}
                          </button>
                        </template>
                      </div>
                      <span v-if="!isAccountMuted(a)" class="settings-note">
                        Blocks annotations and new submissions for the number of
                        days entered. Their account and existing scans stay up.
                      </span>
                    </div>

                    <!-- Ban -->
                    <div class="settings-row settings-row-danger">
                      <span class="settings-label">Ban</span>
                      <span class="settings-value">
                        <template v-if="a.bannedAt"
                          >Banned {{ formatDayMonthYear(a.bannedAt) }}</template
                        >
                        <span v-else class="dim">Not banned</span>
                      </span>
                      <button
                        v-if="!a.bannedAt"
                        type="button"
                        class="btn btn-reject settings-change"
                        :disabled="actionLoading === `acct-${a.id}-ban`"
                        @click="banAccount(a)"
                      >
                        {{ actionLoading === `acct-${a.id}-ban` ? "…" : "Ban" }}
                      </button>
                      <span v-if="!a.bannedAt" class="settings-note">
                        Permanent. Hides every restroom they've submitted from
                        the archive.
                      </span>
                    </div>

                    <!-- Delete -->
                    <div class="settings-row settings-row-danger">
                      <span class="settings-label">Delete</span>
                      <span class="settings-value dim"
                        >Removes the account from the database</span
                      >
                      <button
                        type="button"
                        class="btn btn-delete settings-change"
                        :disabled="actionLoading === `acct-${a.id}-delete`"
                        @click="deleteAccount(a)"
                      >
                        {{
                          actionLoading === `acct-${a.id}-delete`
                            ? "…"
                            : "Delete"
                        }}
                      </button>
                      <span class="settings-note">
                        Their published restrooms stay in the archive,
                        unattributed. The email isn't blacklisted — they can
                        sign up again.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <!-- All annotations -->
        <div v-show="adminSection === 'annotations'">
          <div v-if="!allAnnotations?.length" class="empty">
            No annotations yet.
          </div>

          <ul v-else class="simple-list">
            <li
              v-for="a in allAnnotations"
              :key="a.id"
              class="simple-row"
              :class="{ 'is-hidden': a.hiddenAt }"
            >
              <div class="simple-main">
                <NuxtLink
                  class="simple-title link"
                  :to="`/r/${a.restroom.slug}`"
                >
                  {{ a.restroom.name }}
                </NuxtLink>
                <span class="simple-meta annotation-body">{{ a.body }}</span>
                <span class="simple-meta">
                  By
                  <UserAttribution :user="a.author" fallback="deleted user" />
                  · {{ a.createdAt }}
                </span>
                <span class="simple-meta">
                  <span v-if="a.hiddenAt" class="pill pill-hidden">Hidden</span>
                  <span v-if="a.openReportCount" class="pill pill-reported"
                    >{{ a.openReportCount }} open
                    {{ a.openReportCount === 1 ? "report" : "reports" }}</span
                  >
                </span>
              </div>
              <div class="simple-actions">
                <button
                  v-if="!a.hiddenAt"
                  type="button"
                  class="btn btn-reject"
                  :disabled="actionLoading === `ann-hide-${a.id}`"
                  @click="hideAnnotation(a.id)"
                >
                  {{ actionLoading === `ann-hide-${a.id}` ? "…" : "Hide" }}
                </button>
                <button
                  v-else
                  type="button"
                  class="btn"
                  :disabled="actionLoading === `ann-unhide-${a.id}`"
                  @click="unhideAnnotation(a.id)"
                >
                  {{ actionLoading === `ann-unhide-${a.id}` ? "…" : "Unhide" }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Audit log -->
        <div v-show="adminSection === 'audit'">
          <div v-if="!auditLog?.length" class="empty">
            No admin actions recorded yet.
          </div>
          <ul v-else class="simple-list audit-list">
            <li
              v-for="entry in auditLog"
              :key="entry.id"
              class="simple-row audit-row"
            >
              <div class="simple-main">
                <span class="simple-title">
                  <UserAttribution
                    v-if="entry.actor"
                    :user="entry.actor"
                    fallback="deleted admin"
                  />
                  <span v-else class="dim">deleted admin</span>
                  <span class="audit-action">
                    {{ auditActionLabel(entry.action) }}</span
                  >
                  <span v-if="entry.targetId" class="audit-target">
                    #{{ entry.targetId }}
                  </span>
                </span>
                <span class="simple-meta">
                  {{ entry.createdAt }}
                  <span
                    v-if="auditMetadataSummary(entry.metadata)"
                    class="audit-meta-summary"
                  >
                    · {{ auditMetadataSummary(entry.metadata) }}
                  </span>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Type scale — four steps, each with one job. Nothing on this page should
   introduce a fifth size.
     15px  identity + main tabs   (the only "large" text)
     13px  content: titles, values, prose, buttons, inputs   (inherited base)
     12px  support: labels, meta, column heads, sub-tabs
     11px  micro: counts, pills, chips, hints
   Spacing runs on a 4px grid: 4 / 8 / 12 / 16 / 20. */
.account-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: #000;
  overflow: hidden;
}
.body-section {
  --gutter: 20px;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--gutter);
}

/* Full-bleed rules: the header stack pulls out to the panel edges and puts the
   gutter back as padding, so the borders span the panel the way the catalog's
   sub-header does, while the content stays on the same left edge as everything
   else. */
.account-header,
.account-tabs {
  margin-inline: calc(-1 * var(--gutter));
  padding-inline: var(--gutter);
}

/* The first row closes the gutter above it as well, so the band it starts sits
   flush under the site header's border, the way the catalog's controls strip
   does. Skipped when the admin banner takes first place, since the row is then
   not what the expand tab frames. */
.body-section > .account-header:first-child {
  margin-top: calc(-1 * var(--gutter));
}

/* Identity row — top of the band, no border, content-sized: the same role
   `.controls` plays in the catalog (search bar sits here, left-clustered,
   flush under the header). Sign out sits on the right, same line. */
.account-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-block: 6px;
  gap: 12px;
  flex-wrap: wrap;
}
.account-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.account-email {
  font-size: 15px;
}
.account-role {
  font-size: 11px;
  line-height: 1.4;
  background: #000;
  color: #fff;
  padding: 2px 6px;
  border-radius: 3px;
}

/* Caps the width of anything that reads as a form, so settings rows and
   checklists don't stretch the full panel on a wide viewport. */
/* Account tabs — bottom of the band the expand tab frames (see
   useAlignToStrip), same position as the Info page's tabs. Styled the same
   flat, color-only way: `.tab-btn`'s #999/#595959/#000 states already match
   `.info-tab`'s, so only the underline/padding need overriding away. */
.account-tabs {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  border-bottom: 1px solid #000;
  padding: 10px var(--gutter);
  margin-bottom: 16px;
  overflow-x: auto;
  box-sizing: border-box;
  min-height: var(--strip-align-height, 0px);
}
.account-tabs .tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border-bottom: 0;
  margin-bottom: 0;
  /* Overrides the shared `.tab-btn`'s 15px — sized for the underlined auth
     tabs — down to the 14px the Info page's tabs and the catalog's headings
     use. Tight line-height for the same reason `.account-actions .link-btn`
     needed it: `.account-page`'s inherited 1.4 (unlike the Info page, which
     doesn't set line-height above `.about-content`) was enough on its own to
     push the row's natural height past `min-height`, so the row grew past
     the tab instead of the tab framing the row. */
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}
.account-tabs .tab-btn:not(.active) .count {
  background: #999;
}

/* Settings rows — label stacked over value, action on the right. Used by the
   Profile tab and by the admin account controls, which are the same kind of
   thing seen from the other side. */
/* Explains what a row's action does, on its own line under it — the row is
   `flex-wrap`, so a full-basis child always breaks below the button. */
/* Rows whose action can't be walked back. Only the label carries the colour —
   a full red row would shout louder than a ban warrants at rest. */
/* Named runs of rows. The heading is the micro step so it groups the rows
   without competing with their labels. */
/* Banners */
.muted-banner {
  background: #fff4e5;
}
.admin-message-banner {
  background: #c33;
  color: #fff;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.admin-message-banner strong {
  font-weight: 700;
  margin-right: 4px;
}
/* Sign-up intro */
/* Submission access request */
/* Shared form */
/* Buttons — row-level actions (Change, Save, Cancel, admin queue actions) sit
   at 12px with tight padding so they match the labels they sit beside rather
   than outweighing them. Only the primary/danger CTAs stay content-level. */
/* Row-level actions sit a step below the content they label, so the shared
   link button is tightened and stepped down here rather than page-wide. */
/* An anchor, not a button, so it takes none of the shared .link-btn reset and
   states the ink colour itself rather than inheriting the user agent's blue. */
/* Counts, pills and chips — the micro step. */
/* Account status badges: filled = a standing fact about the account, outlined
   = something waiting on an admin. */
/* Pending submission queue — the catalog's expand-in-place row, so the
   admin list reads the same way the public browse list does. */
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
dt {
  color: #666;
  white-space: nowrap;
}
dd {
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

/* Row lists */
.inline-reject-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inline-reject-form {
  padding: 8px 0 4px;
}
/* Audit log */
.audit-action {
  color: #000;
}
.audit-target {
  color: #888;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  margin-left: 4px;
}
.audit-meta-summary {
  color: #666;
  word-break: break-word;
}
/* Admin accounts list */
.account-row {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #e8e8e8;
}
.account-row > .simple-row {
  border-bottom: 0;
}
/* Capped to the same measure as the account's own settings form: these are a
   form, not a table, and a full-panel-wide row of controls was most of why the
   old layout read as a pile of buttons. */
.account-options {
  padding: 12px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: 1px solid #e8e8e8;
  max-width: 480px;
}
.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
  margin-top: 2px;
}
/* A row whose action needs an input beside the button. */
.mod-action {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mute-days {
  width: 64px;
  border: 1px solid #000;
  padding: 5px 6px;
  font: inherit;
}
.admin-msg-preview,
/* Same panel-width step as the catalog and its header — these all track how
   much room the panel has, so they follow its width rather than the window's. */
@container panel (max-width: 560px) {
  .body-section {
    --gutter: 12px;
  }
  .account-tabs {
    gap: 14px;
    padding-block: 6px;
  }
  .account-tabs .tab-btn {
    font-size: 12px;
  }
  .tab-btn {
    padding: 6px 10px 7px;
  }
  .queue-head,
  .queue-main {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  /* Location is the least useful column when there's no room for three. */
  .queue-head span:last-child,
  .queue-cell:last-child {
    display: none;
  }
}

/* Sheet layout and touch behaviour — neither follows the panel's width. */
@media (max-width: 750px) {
  /* The expand tab moves to the panel's bottom edge here, so there is nothing
     to align to. The row keeps its natural height and its normal gutter. */
  .account-tabs {
    min-height: 0;
  }
  .body-section > .account-header:first-child {
    margin-top: 0;
  }
}
</style>
