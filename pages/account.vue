<script setup lang="ts">
import type { SubTab } from "~/components/AccountSubTabs.vue";
import type { LocationQueryRaw } from "vue-router";
import type { AccountTab } from "~/composables/useAccountNav";
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
    (mySubmissions.value ?? []).filter((r) => r.status === "published").length,
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

// The page holds the four queues only for their tab badges; a section
// component renders each. These are keyed fetches, so both callers share one
// request rather than issuing two that drift apart after a refresh.
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

// Which pending submission is expanded. Owned here rather than by the section
// component because expanding one previews its scan in the layout's viewer, and
// navigating away from the queue has to collapse it.
const expandedPendingId = ref<number | null>(null);

const roleLabel = computed(() => {
  if (!user.value) return "";
  if (isAdmin.value) return "Admin";
  if (canSubmit.value) return "Archivist";
  return "Annotator";
});

// -------------- Account tabs --------------
// Tab, group and section live in `useAccountNav`, a shared singleton, so the
// position survives leaving the page. The header links back to a bare
// `/account`, so page-local refs sent an admin who stepped out to the catalog
// back to the Profile tab every time.
const route = useRoute();
const router = useRouter();

const {
  tab: accountTab,
  adminGroup,
  adminSectionByGroup,
  adminSection,
  submissionsSection,
} = useAccountNav();

function isValidTab(v: unknown): v is AccountTab {
  return (
    v === "profile" ||
    v === "submissions" ||
    v === "annotations" ||
    (v === "admin" && isAdmin.value)
  );
}

/**
 * Seeds the position from the URL, where the URL says anything.
 *
 * An explicit link beats what was remembered — following `?tab=profile` has to
 * land on Profile even if the last visit ended on the Admin tab — but a bare
 * `/account`, which is what the header link produces, leaves the remembered
 * position alone.
 *
 * Runs on setup and again when `isAdmin` resolves, for the same reason the tab
 * is re-applied: the session is not known during the first render, so an
 * admin's own deep link looks invalid until it is.
 */
function applyQuery() {
  const { tab, group, section } = route.query;

  if (isValidTab(tab)) accountTab.value = tab;

  if (isAdminGroup(group)) adminGroup.value = group;

  if (typeof section !== "string") return;

  if (accountTab.value === "admin") {
    // Only accepted against the group it belongs to, so
    // `?group=accounts&section=rejected` opens the Accounts group at its own
    // remembered section rather than at one that would render nothing.
    if (sectionsFor(adminGroup.value).includes(section)) {
      adminSectionByGroup.value[adminGroup.value] = section;
    }
  } else if (
    accountTab.value === "submissions" &&
    isSubmissionsSection(section)
  ) {
    submissionsSection.value = section;
  }
}

applyQuery();

/**
 * Keeps the address bar matching the position, so a reload or a copied link
 * lands where the page actually is.
 *
 * One watcher owns every write to the query, rather than each setter doing its
 * own: the setters then only move state, and the URL cannot drift from it. The
 * params are rebuilt rather than merged so a tab that has no group or section
 * drops the previous tab's — `group` is the Admin tab's alone and would
 * otherwise linger on Profile.
 *
 * Client-only. There is no address bar to update during SSR, and a
 * `router.replace` there is a redirect.
 */
function syncQueryToState() {
  const { tab: _t, group: _g, section: _s, ...rest } = route.query;
  const query: LocationQueryRaw = { ...rest, tab: accountTab.value };

  if (accountTab.value === "admin") {
    query.group = adminGroup.value;
    if (adminSection.value) query.section = adminSection.value;
  } else if (accountTab.value === "submissions") {
    query.section = submissionsSection.value;
  }

  router.replace({ query });
}

if (import.meta.client) {
  watch(
    [accountTab, adminGroup, adminSection, submissionsSection],
    syncQueryToState,
    // Immediate, so arriving on a bare `/account` writes the remembered
    // position into the URL instead of leaving the two disagreeing.
    { immediate: true },
  );
}

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
  // Only moves state; `syncQueryToState` re-points the URL at the new tab's own
  // sub-tabs, dropping any that the tab cannot show.
  accountTab.value = tab;
}

// Warn before navigating away from the account page entirely (nav links,
// browser back/forward, programmatic navigateTo) while a scan is loaded.
onBeforeRouteLeave(() => {
  if (hasUnsavedSubmission.value && !confirm(LEAVE_SUBMISSION_WARNING)) {
    return false;
  }
});

// Expanding a pending submission previews its scan in the same right-hand
// viewer the submission wizard uses, so there is no separate "preview" button.
// Not treated as unsaved progress: the preview is read-only, so leaving needs
// no confirmation.
watch(expandedPendingId, (id) => {
  const r =
    id == null ? null : pendingRestrooms.value?.find((p) => p.id === id);
  previewModelUrl.value = r?.modelUrl ?? null;
});

// Navigating away from the pending queue should collapse any expanded preview
// rather than leave it orphaned in the viewer with no visible expanded row to
// match it. That is now three ways out — the tab, the group, and the section —
// so it watches where the queue actually is rather than the tab alone.
const onPendingQueue = computed(
  () =>
    accountTab.value === "admin" &&
    adminGroup.value === "submissions" &&
    adminSection.value === "pending",
);

watch(onPendingQueue, (showing) => {
  if (!showing) expandedPendingId.value = null;
});

// The session resolves client-side, so `?tab=admin` looks invalid on first
// render; re-apply it once admin status is known.
watch(isAdmin, () => applyQuery());

// The Admin tab's own badge: every queue in every group, since the tab is one
// button and cannot say which group the backlog is in.
const adminQueueCount = computed(
  () =>
    (pendingRestrooms.value?.length ?? 0) +
    (pendingUsers.value?.length ?? 0) +
    (annotationReports.value?.length ?? 0) +
    (removalRequests.value?.length ?? 0),
);

// -------------- Sub-tabs --------------
// The Admin tab has two rows: a group, and the sections inside it. Every other
// tab with sub-tabs has one row, which is the group row's slot. Both rows carry
// their own query param so any section can be linked to and survives a reload.
//
// The grouping exists because the flat row had grown to nine buttons in two
// visual clusters that did not correspond to anything: `upgrades` sat beside
// `removals` although one is about accounts and the other about entries, and
// the three restroom lists were split across the row's gap. The groups are the
// subject each list is about, and the queue/browse split moves inside them,
// where the badge already says which is which.
/* --- Badges ---------------------------------------------------------------- */
// Only the four queues have a backlog. A group's badge is the sum of its own
// queues, so a count never disappears just because it is one level down.

const pendingCount = computed(() => pendingRestrooms.value?.length ?? 0);
const removalCount = computed(() => removalRequests.value?.length ?? 0);
const upgradeCount = computed(() => pendingUsers.value?.length ?? 0);
const reportCount = computed(() => annotationReports.value?.length ?? 0);

const GROUP_LABEL: Record<AdminGroup, string> = {
  submissions: "Submissions",
  accounts: "Accounts",
  annotations: "Annotations",
  audit: "Audit",
};

const groupCount = computed<Record<AdminGroup, number>>(() => ({
  submissions: pendingCount.value + removalCount.value,
  accounts: upgradeCount.value,
  annotations: reportCount.value,
  audit: 0,
}));

const adminGroupTabs = computed<SubTab[]>(() =>
  ADMIN_GROUPS.map((id) => ({
    id,
    label: GROUP_LABEL[id],
    count: groupCount.value[id],
  })),
);

const SECTION_LABEL: Record<string, string> = {
  pending: "Pending",
  archived: "Archived",
  rejected: "Rejected",
  removals: "Removal requests",
  directory: "Directory",
  upgrades: "Upgrades",
  all: "All annotations",
  reports: "Reports",
};

/** Section badges, for the sections that are queues. Absent means no badge. */
const sectionCount = computed<Record<string, number>>(() => ({
  pending: pendingCount.value,
  removals: removalCount.value,
  upgrades: upgradeCount.value,
  reports: reportCount.value,
}));

const adminSectionTabs = computed<SubTab[]>(() =>
  sectionsFor(adminGroup.value).map((id) => ({
    id,
    label: SECTION_LABEL[id] ?? id,
    count: sectionCount.value[id] ?? 0,
  })),
);

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

/* --- The two rows ---------------------------------------------------------- */

// The first row is the admin groups on the Admin tab and the submissions
// sections everywhere else, so one <AccountSubTabs> covers both.
const primarySubTabs = computed(() => {
  if (accountTab.value === "admin" && isAdmin.value)
    return adminGroupTabs.value;
  if (accountTab.value === "submissions") return submissionsSubTabs.value;
  return [];
});

const primarySelection = computed({
  get: () =>
    accountTab.value === "admin" ? adminGroup.value : submissionsSection.value,
  set: (v: string) => setPrimary(v),
});

// The second row exists only under an admin group that has sections.
const secondarySubTabs = computed(() =>
  accountTab.value === "admin" && isAdmin.value ? adminSectionTabs.value : [],
);

const secondarySelection = computed({
  get: () => adminSection.value,
  set: (v: string) => setAdminSection(v),
});

function setPrimary(value: string) {
  if (accountTab.value === "admin") {
    if (!isAdminGroup(value)) return;
    adminGroup.value = value;
    return;
  }
  if (accountTab.value !== "submissions") return;
  if (!isSubmissionsSection(value)) return;
  // No unsaved-work guard here: the sub-tab panels are v-show, so the wizard
  // stays mounted and an in-progress scan survives the switch. Only leaving
  // the Submissions tab entirely (setTab) unmounts it.
  submissionsSection.value = value;
}

function setAdminSection(value: string) {
  if (!sectionsFor(adminGroup.value).includes(value)) return;
  adminSectionByGroup.value[adminGroup.value] = value;
}
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

      <!-- Top row sits where the catalog's search bar does: left-clustered, no
           border, flush under the site header, the same position `.controls`
           holds there. Sign out sits on the right, on the same line. -->
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

      <!-- Bottom row is what the expand tab frames. Same band position and the
           same flat, colour-only styling as the Info page's tabs. -->
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
        v-if="primarySubTabs.length"
        v-model="primarySelection"
        :tabs="primarySubTabs"
      />

      <!-- The Admin tab's second row: the sections inside the chosen group.
           Absent for a group that is a single list, so the row never appears
           holding one button. -->
      <AccountSubTabs
        v-if="secondarySubTabs.length"
        v-model="secondarySelection"
        :tabs="secondarySubTabs"
        variant="plain"
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
        <!-- Submissions -->
        <AdminSubmissionsPending
          v-if="adminGroup === 'submissions' && adminSection === 'pending'"
          v-model:expanded-id="expandedPendingId"
        />
        <AdminArchive
          v-else-if="
            adminGroup === 'submissions' && adminSection === 'archived'
          "
        />
        <AdminRejected
          v-else-if="
            adminGroup === 'submissions' && adminSection === 'rejected'
          "
        />
        <AdminRemovals
          v-else-if="
            adminGroup === 'submissions' && adminSection === 'removals'
          "
        />

        <!-- Accounts -->
        <AdminAccounts
          v-else-if="adminGroup === 'accounts' && adminSection === 'directory'"
        />
        <AdminUpgrades
          v-else-if="adminGroup === 'accounts' && adminSection === 'upgrades'"
        />

        <!-- Annotations -->
        <AdminAnnotations
          v-else-if="adminGroup === 'annotations' && adminSection === 'all'"
        />
        <AdminReports
          v-else-if="adminGroup === 'annotations' && adminSection === 'reports'"
        />

        <!-- Audit: one list, no sections -->
        <AdminAuditLog v-else-if="adminGroup === 'audit'" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Only the page's own chrome lives here: the shell, the header band, and the
   two tab rows. Everything the tab panels use is shared with the components
   that render them, and lives in assets/css/account.css. The type scale those
   sizes belong to is documented there. */

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
   gutter back as padding, so its borders span the panel the way the catalog's
   sub-header does while the content stays on the same left edge as everything
   below it. */
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

/* Identity row: the top of the band, no border, sized by its content. It plays
   the same role the controls strip does in the catalog, where the search bar
   sits left-clustered and flush under the header. Sign out sits on the right,
   on the same line. */
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

/* Account tabs: the bottom of the band the expand tab frames, in the same
   position as the Info page's tabs and styled the same flat, colour-only way.
   The shared `.tab-btn` states already match, so only the underline and the
   padding are overridden away. `min-height` is what lets the row grow to meet
   the expand tab; see useAlignToStrip. */
.account-tabs {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  border-bottom: 1px solid #000;
  padding-block: 10px;
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
  /* Steps the shared 15px, which is sized for the underlined auth tabs, down to
     the 14px the Info page's tabs and the catalog's headings use. The tight
     line-height matters as much as the size: the page's inherited 1.4 was on
     its own enough to push the row's natural height past `min-height`, so the
     row grew past the expand tab instead of the tab framing the row. */
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}

.account-tabs .tab-btn:not(.active) .count {
  background: #999;
}

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

/* Same panel-width step as the catalog and its header. These track how much
   room the panel has, not the window. */
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
}

/* Sheet layout, which follows the window rather than the panel: below this the
   expand tab moves to the panel's bottom edge, so there is nothing for the tab
   row to align to. It keeps its natural height and its normal gutter. */
@media (max-width: 750px) {
  .account-tabs {
    min-height: 0;
  }
  .body-section > .account-header:first-child {
    margin-top: 0;
  }
}
</style>
