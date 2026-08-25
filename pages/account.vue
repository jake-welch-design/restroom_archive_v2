<script setup lang="ts">
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

// The page holds the four queues only for their tab badges; AdminQueues renders
// them. These are keyed fetches, so both callers share one request rather than
// issuing two that drift apart after a refresh.
const { data: pendingRestrooms, refresh: refreshRestroomQueue } =
  useRestroomQueue();
const { data: pendingUsers, refresh: refreshUserQueue } = useUserQueue();
const { data: annotationReports, refresh: refreshAnnotationReports } =
  useAnnotationReports();
const { data: removalRequests, refresh: refreshRemovalQueue } =
  useRemovalQueue();

// The queues load as soon as admin status resolves, because their counts are
// badges on the Admin tab and have to be right before the tab is opened. The
// browse lists (accounts, annotations, audit) deliberately do not: they carry
// no badge, so each fetches when its own component mounts, which is the first
// time its section is selected.
watch(
  isAdmin,
  async (admin) => {
    if (!admin) return;
    await Promise.all([
      refreshRestroomQueue(),
      refreshUserQueue(),
      refreshAnnotationReports(),
      refreshRemovalQueue(),
    ]);
  },
  { immediate: true },
);

// Which pending submission is expanded. Owned here rather than by AdminQueues
// because expanding one previews its scan in the layout's viewer, and leaving
// the Admin tab has to collapse it.
const expandedPendingId = ref<number | null>(null);

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

/** The four sections AdminQueues renders, as opposed to the browse lists. */
const QUEUE_SECTIONS = [
  "submissions",
  "upgrades",
  "reports",
  "removals",
] as const;

type QueueSection = (typeof QUEUE_SECTIONS)[number];

function isQueueSection(section: AdminSection): section is QueueSection {
  return (QUEUE_SECTIONS as readonly string[]).includes(section);
}

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

      <div
        v-if="isAdmin && accountTab === 'admin'"
        class="tab-panel"
        role="tabpanel"
      >
        <AdminQueues
          v-if="isQueueSection(adminSection)"
          v-model:expanded-id="expandedPendingId"
          :section="adminSection"
        />
        <AdminAccounts v-else-if="adminSection === 'accounts'" />
        <AdminAnnotations v-else-if="adminSection === 'annotations'" />
        <AdminAuditLog v-else-if="adminSection === 'audit'" />
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
