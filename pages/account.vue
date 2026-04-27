<script setup lang="ts">
const {
  user,
  loggedIn,
  canSubmit,
  submissionRequested,
  isAdmin,
  isMuted,
  mutedUntil,
  adminMessage,
  refreshSession,
  signout,
} = useAuth();
const { select } = useSelection();

const SUBMISSION_AGREEMENTS = [
  "Scans will be complete and without too many holes (excluding mirrored surfaces).",
  "Scans will be cropped to remove any false spaces caused by reflective surfaces.",
  "Toilets must be flushed before scanning.",
  "I will avoid scanning restrooms that aren't private/ a single room. I will never scan if there are other people present.",
  "I will use my best judgement when submitting. I won't submit anything too traumatizing or gross.",
  "I agree to always be respectful.",
];

// -------------- Auth form (logged-out) --------------
const authTab = ref<"signin" | "signup">("signin");
const email = ref("");
const password = ref("");
const username = ref("");
const displayName = ref("");
const turnstileToken = ref("");
const authError = ref("");
const authLoading = ref(false);

async function submitAuth() {
  if (!turnstileToken.value) {
    // Turnstile sometimes paints its "success" UI a beat before the token
    // reaches the v-model ref. Wait briefly so a fast Enter-key submit
    // (or password manager autofill) doesn't race past it.
    for (let i = 0; i < 20 && !turnstileToken.value; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!turnstileToken.value) {
      authError.value = "Still verifying — please wait a moment and try again.";
      return;
    }
  }
  authError.value = "";
  authLoading.value = true;
  try {
    const endpoint =
      authTab.value === "signin" ? "/api/auth/signin" : "/api/auth/signup";
    const body: Record<string, string> = {
      email: email.value,
      password: password.value,
      turnstileToken: turnstileToken.value,
    };
    if (authTab.value === "signup") {
      body.username = username.value;
      if (displayName.value) body.displayName = displayName.value;
    }
    await $fetch(endpoint, { method: "POST", body });
    await refreshSession();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    authError.value =
      err.data?.statusMessage ?? err.message ?? "Something went wrong.";
    turnstileToken.value = "";
  } finally {
    authLoading.value = false;
  }
}

function switchTab(tab: "signin" | "signup") {
  authTab.value = tab;
  authError.value = "";
  turnstileToken.value = "";
  if (tab === "signin") {
    username.value = "";
    displayName.value = "";
  }
}

// -------------- Display name editor --------------
const editingDisplayName = ref(false);
const displayNameDraft = ref("");
const displayNameLoading = ref(false);
const displayNameError = ref("");
const dnInput = ref<HTMLInputElement | null>(null);

function startEditDisplayName() {
  displayNameDraft.value =
    (user.value as { displayName?: string | null } | null)?.displayName ?? "";
  displayNameError.value = "";
  editingDisplayName.value = true;
  nextTick(() => dnInput.value?.focus());
}

async function saveDisplayName() {
  displayNameLoading.value = true;
  displayNameError.value = "";
  try {
    await $fetch("/api/me", {
      method: "PATCH",
      body: { displayName: displayNameDraft.value },
    });
    await refreshSession();
    editingDisplayName.value = false;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    displayNameError.value =
      err.data?.statusMessage ?? "Could not save display name.";
  } finally {
    displayNameLoading.value = false;
  }
}

// -------------- Submission access request --------------
const agreementChecks = ref<boolean[]>(SUBMISSION_AGREEMENTS.map(() => false));
const showAgreementForm = ref(false);
const agreementError = ref("");
const agreementLoading = ref(false);

const allAgreementsChecked = computed(() =>
  agreementChecks.value.every((v) => v),
);

function openAgreementForm() {
  agreementChecks.value = SUBMISSION_AGREEMENTS.map(() => false);
  agreementError.value = "";
  showAgreementForm.value = true;
}

async function submitAgreement() {
  if (!allAgreementsChecked.value) return;
  agreementError.value = "";
  agreementLoading.value = true;
  try {
    await $fetch("/api/auth/request-submission-access", {
      method: "POST",
      body: { agreements: SUBMISSION_AGREEMENTS },
    });
    await refreshSession();
    showAgreementForm.value = false;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    agreementError.value =
      err.data?.statusMessage ?? err.message ?? "Could not submit request.";
  } finally {
    agreementLoading.value = false;
  }
}

// -------------- Submit form --------------
const uploadName = ref("");
const uploadLocation = ref("");
const uploadDate = ref("");
const uploadLat = ref("");
const uploadLng = ref("");
const uploadDescription = ref("");
const uploadDescriptors = ref<string[]>([]);
const uploadFile = ref<File | null>(null);
const uploadError = ref("");
const uploadLoading = ref(false);
const uploadSuccess = ref(false);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  uploadFile.value = input.files?.[0] ?? null;
}

async function submitUpload() {
  if (!uploadFile.value) {
    uploadError.value = "Please select a .glb file.";
    return;
  }
  uploadError.value = "";
  uploadLoading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", uploadFile.value);
    fd.append("name", uploadName.value);
    fd.append("location", uploadLocation.value);
    fd.append("isoDate", uploadDate.value);
    if (uploadLat.value) fd.append("lat", uploadLat.value);
    if (uploadLng.value) fd.append("lng", uploadLng.value);
    if (uploadDescription.value)
      fd.append("description", uploadDescription.value);
    if (uploadDescriptors.value.length)
      fd.append("descriptors", JSON.stringify(uploadDescriptors.value));

    await $fetch("/api/restrooms/submit", { method: "POST", body: fd });
    uploadSuccess.value = true;
    await refreshMySubmissions();
    if (isAdmin.value) {
      await Promise.all([refreshRestroomQueue(), refreshNuxtData("restrooms")]);
      setTimeout(() => resetUpload(), 2000);
    }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    uploadError.value =
      err.data?.statusMessage ?? err.message ?? "Upload failed.";
  } finally {
    uploadLoading.value = false;
  }
}

function resetUpload() {
  uploadName.value = "";
  uploadLocation.value = "";
  uploadDate.value = "";
  uploadLat.value = "";
  uploadLng.value = "";
  uploadDescription.value = "";
  uploadDescriptors.value = [];
  uploadFile.value = null;
  uploadError.value = "";
  uploadSuccess.value = false;
}

// -------------- My submissions / annotations --------------
type MySubmission = {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  isoDate: string;
  status: string;
  createdAt: string;
  removalRequested: boolean;
  rejectionMessage: string | null;
};

type MyAnnotation = {
  id: number;
  body: string;
  createdAt: string;
  restroomSlug: string;
  restroomName: string;
  restroomLocation: string;
  restroomDate: string;
};

const { data: mySubmissions, refresh: refreshMySubmissions } = await useFetch<
  MySubmission[]
>("/api/me/submissions", {
  server: false,
  immediate: false,
  default: () => [],
});

const { data: myAnnotations, refresh: refreshMyAnnotations } = await useFetch<
  MyAnnotation[]
>("/api/me/annotations", {
  server: false,
  immediate: false,
  default: () => [],
});

watch(
  loggedIn,
  async (v) => {
    if (v) {
      await Promise.all([refreshMySubmissions(), refreshMyAnnotations()]);
    }
  },
  { immediate: true },
);

function submissionStatusLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "pending") return "Awaiting review";
  if (status === "rejected" || status === "hidden") return "Rejected";
  if (status === "removal_requested") return "Removal requested";
  return status;
}

// Lists default to collapsed; click the section header to expand.
const mySubmissionsOpen = ref(false);
const pendingSubmissionsOpen = ref(false);
const myAnnotationsOpen = ref(false);

const publishedSubmissions = computed(() =>
  (mySubmissions.value ?? []).filter(
    (r) => r.status === "published" || r.status === "removal_requested",
  ),
);

const pendingAndRejectedSubmissions = computed(() =>
  (mySubmissions.value ?? []).filter(
    (r) =>
      r.status === "pending" ||
      r.status === "rejected" ||
      r.status === "hidden",
  ),
);

const removalSlug = ref<string | null>(null);
const removalReason = ref("");
const annotationActionId = ref<number | null>(null);
const submissionActionId = ref<number | null>(null);
const myActionError = ref("");

function openRemovalForm(slug: string) {
  removalSlug.value = slug;
  removalReason.value = "";
  myActionError.value = "";
}

async function submitRemovalRequest(slug: string) {
  submissionActionId.value =
    (mySubmissions.value ?? []).find((r) => r.slug === slug)?.id ?? null;
  myActionError.value = "";
  try {
    await $fetch(`/api/restrooms/${slug}/request-removal`, {
      method: "POST",
      body: { reason: removalReason.value || undefined },
    });
    removalSlug.value = null;
    removalReason.value = "";
    await refreshMySubmissions();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    myActionError.value =
      err.data?.statusMessage ?? "Could not submit request.";
  } finally {
    submissionActionId.value = null;
  }
}

async function deleteMyAnnotation(slug: string, id: number) {
  if (!confirm("Delete this annotation?")) return;
  annotationActionId.value = id;
  myActionError.value = "";
  try {
    await $fetch(`/api/restrooms/${slug}/annotations/${id}`, {
      method: "DELETE",
    });
    await refreshMyAnnotations();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    myActionError.value =
      err.data?.statusMessage ?? "Could not delete annotation.";
  } finally {
    annotationActionId.value = null;
  }
}

async function dismissRejectedSubmission(
  slug: string,
  id: number,
  status: string,
) {
  const msg =
    status === "pending"
      ? "Withdraw this pending submission? This cannot be undone."
      : "Remove this rejected submission from your list?";
  if (!confirm(msg)) return;
  submissionActionId.value = id;
  myActionError.value = "";
  try {
    await $fetch(`/api/restrooms/${slug}`, { method: "DELETE" });
    await refreshMySubmissions();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    myActionError.value =
      err.data?.statusMessage ?? "Could not dismiss submission.";
  } finally {
    submissionActionId.value = null;
  }
}

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

watch(
  isAdmin,
  async (v) => {
    if (v) {
      await Promise.all([
        refreshRestroomQueue(),
        refreshUserQueue(),
        refreshRemovalQueue(),
      ]);
    }
  },
  { immediate: true },
);

const actionLoading = ref<string | null>(null);
const actionError = ref("");

async function runAction(key: string, url: string, after: () => Promise<void>) {
  actionLoading.value = key;
  actionError.value = "";
  try {
    await $fetch(url, { method: "POST" });
    await after();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Action failed.";
  } finally {
    actionLoading.value = null;
  }
}

const publishRestroom = (id: number) =>
  runAction(
    `r-publish-${id}`,
    `/api/admin/restrooms/${id}/publish`,
    async () => {
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
const removeRestroom = (id: number) =>
  runAction(
    `rm-reject-${id}`,
    `/api/admin/restrooms/${id}/reject`,
    refreshRemovalQueue,
  );
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
    await refreshRestroomQueue();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Action failed.";
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
}

function isAccountMuted(account: AccountRow): boolean {
  if (!account.mutedUntil) return false;
  const ms = Date.parse(`${account.mutedUntil.replace(" ", "T")}Z`);
  return Number.isFinite(ms) && ms > Date.now();
}

function accountStatusLabel(account: AccountRow): string {
  if (account.bannedAt) return "Banned";
  if (isAccountMuted(account)) return `Muted until ${account.mutedUntil}`;
  if (account.role === "admin") return "Admin";
  if (account.approvedAt) return "Submission access";
  if (account.submissionRequestedAt) return "Submission access requested";
  return "Archivist";
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
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Action failed.";
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
    actionError.value = "Enter a number of days to mute.";
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
    const err = e as { data?: { statusMessage?: string } };
    renameError.value = err.data?.statusMessage ?? "Rename failed.";
  } finally {
    actionLoading.value = null;
  }
}

const roleLabel = computed(() => {
  if (!user.value) return "";
  if (isAdmin.value) return "Admin";
  if (canSubmit.value) return "Archivist · submission access";
  if (submissionRequested.value)
    return "Archivist · awaiting submission approval";
  return "Archivist";
});
</script>

<template>
  <div class="account-page">
    <DirectoryHeader />

    <!-- Logged-out: auth forms -->
    <div v-if="!loggedIn" class="body-section">
      <div class="auth-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: authTab === 'signin' }"
          @click="switchTab('signin')"
        >
          Sign in
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: authTab === 'signup' }"
          @click="switchTab('signup')"
        >
          Create account
        </button>
      </div>

      <div v-if="authTab === 'signup'" class="signup-intro">
        <h2 class="signup-intro-title">Become an archivist</h2>
        <p>Leave annotations and submit restrooms to be part of the archive.</p>
      </div>

      <form class="form" @submit.prevent="submitAuth">
        <label class="field">
          <span class="field-label">Email</span>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="field-input"
          />
        </label>

        <label v-if="authTab === 'signup'" class="field">
          <span class="field-label">Username</span>
          <input
            v-model="username"
            type="text"
            required
            autocomplete="username"
            minlength="3"
            maxlength="20"
            pattern="[a-z0-9_]+"
            class="field-input"
          />
          <span class="field-hint"
            >3–20 lowercase letters, numbers, or underscores. Cannot be
            changed.</span
          >
        </label>

        <label v-if="authTab === 'signup'" class="field">
          <span class="field-label">Display name (optional)</span>
          <input
            v-model="displayName"
            type="text"
            autocomplete="name"
            maxlength="25"
            class="field-input"
          />
        </label>

        <label class="field">
          <span class="field-label">Password</span>
          <input
            v-model="password"
            type="password"
            required
            :autocomplete="
              authTab === 'signup' ? 'new-password' : 'current-password'
            "
            class="field-input"
          />
        </label>
        <p v-if="authTab === 'signup'" class="field-hint">
          Minimum 8 characters.
        </p>

        <NuxtTurnstile v-model="turnstileToken" class="turnstile" />

        <p v-if="authError" class="form-error">{{ authError }}</p>

        <button
          type="submit"
          class="primary-btn"
          :disabled="authLoading || !turnstileToken"
        >
          {{
            authLoading
              ? "…"
              : !turnstileToken
                ? "Verifying…"
                : authTab === "signin"
                  ? "Sign in"
                  : "Create account"
          }}
        </button>
      </form>
    </div>

    <!-- Logged-in -->
    <div v-else class="body-section">
      <div v-if="adminMessage" class="admin-message-banner">
        <strong>From admin:</strong> {{ adminMessage }}
      </div>

      <header class="account-header">
        <div class="account-identity">
          <template v-if="editingDisplayName">
            <form class="dn-inline-form" @submit.prevent="saveDisplayName">
              <input
                ref="dnInput"
                v-model="displayNameDraft"
                type="text"
                maxlength="25"
                class="dn-input"
                placeholder="Display name (blank to clear)"
                @keydown.esc="editingDisplayName = false"
              />
              <button type="submit" class="dn-btn" :disabled="displayNameLoading">
                {{ displayNameLoading ? "…" : "Save" }}
              </button>
              <button type="button" class="dn-btn dn-cancel" @click="editingDisplayName = false">
                Cancel
              </button>
            </form>
            <p v-if="displayNameError" class="form-error dn-error">{{ displayNameError }}</p>
          </template>
          <template v-else>
            <UserAttribution
              v-if="user"
              class="account-email"
              :user="{
                username: (user as any).username,
                displayName: (user as any).displayName,
              }"
            />
            <button type="button" class="dn-edit-btn" @click="startEditDisplayName">
              edit
            </button>
          </template>
        </div>
        <div class="account-header-right">
          <span class="account-role">{{ roleLabel }}</span>
          <button type="button" class="link-btn" @click="signout">
            Sign out
          </button>
        </div>
      </header>

      <div v-if="isMuted" class="awaiting muted-banner">
        <p>
          Your account is muted until {{ mutedUntil }}. You can't post
          annotations or submit restrooms during this period.
        </p>
      </div>

      <p v-if="myActionError" class="form-error action-error">
        {{ myActionError }}
      </p>

      <!-- Approved: submit form -->
      <section v-if="canSubmit" class="section">
        <h2 class="section-title">New submission</h2>
        <div v-if="uploadSuccess" class="success-message">
          <p>{{ isAdmin ? "Published." : "Submitted — awaiting approval." }}</p>
          <button type="button" class="link-btn" @click="resetUpload">
            Submit another
          </button>
        </div>
        <form v-else class="form" @submit.prevent="submitUpload">
          <label class="field">
            <span class="field-label">Name <span class="req">*</span></span>
            <input
              v-model="uploadName"
              type="text"
              required
              class="field-input"
            />
          </label>
          <label class="field">
            <span class="field-label">Location <span class="req">*</span></span>
            <input
              v-model="uploadLocation"
              type="text"
              required
              placeholder="City, State"
              class="field-input"
            />
          </label>
          <label class="field">
            <span class="field-label">Date <span class="req">*</span></span>
            <input
              v-model="uploadDate"
              type="date"
              required
              class="field-input"
            />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">Latitude</span>
              <input
                v-model="uploadLat"
                type="number"
                step="any"
                min="-90"
                max="90"
                class="field-input"
              />
            </label>
            <label class="field">
              <span class="field-label">Longitude</span>
              <input
                v-model="uploadLng"
                type="number"
                step="any"
                min="-180"
                max="180"
                class="field-input"
              />
            </label>
          </div>
          <label class="field">
            <span class="field-label">Description</span>
            <textarea
              v-model="uploadDescription"
              class="field-input field-textarea"
              maxlength="1000"
              rows="4"
            />
            <span class="char-count">{{ uploadDescription.length }}/1000</span>
          </label>
          <div class="field">
            <span class="field-label">Descriptors</span>
            <TagInput v-model="uploadDescriptors" />
          </div>
          <label class="field">
            <span class="field-label">GLB file <span class="req">*</span></span>
            <input
              type="file"
              accept=".glb"
              required
              class="field-input"
              @change="onFileChange"
            />
          </label>

          <p v-if="uploadError" class="form-error">{{ uploadError }}</p>

          <button type="submit" class="primary-btn" :disabled="uploadLoading">
            {{
              uploadLoading
                ? "Uploading…"
                : isAdmin
                  ? "Submit"
                  : "Submit for review"
            }}
          </button>
        </form>
      </section>

      <!-- Awaiting submission approval -->
      <div v-else-if="submissionRequested" class="awaiting">
        <p>
          Your request to submit restrooms is awaiting admin review. You can
          leave annotations on any restroom in the meantime.
        </p>
      </div>

      <!-- Submission access request flow -->
      <section v-else class="section">
        <div v-if="!showAgreementForm" class="request-cta">
          <p class="request-cta-copy">
            You can leave annotations on any restroom. To submit your own
            restroom scans, request access below.
          </p>
          <button type="button" class="primary-btn" @click="openAgreementForm">
            Request access to submit restroom scans
          </button>
        </div>

        <form v-else class="agreement-form" @submit.prevent="submitAgreement">
          <p class="agreement-intro">
            I agree to abide by the following guidelines when submitting
            restrooms:
          </p>
          <label
            v-for="(text, i) in SUBMISSION_AGREEMENTS"
            :key="i"
            class="agreement-row"
          >
            <input
              v-model="agreementChecks[i]"
              type="checkbox"
              class="agreement-check"
            />
            <span>{{ text }}</span>
          </label>
          <p class="agreement-note">
            Admins have the right to deny or remove any submissions as they see
            fit.
          </p>

          <p v-if="agreementError" class="form-error">{{ agreementError }}</p>

          <div class="agreement-actions">
            <button
              type="button"
              class="link-btn"
              @click="showAgreementForm = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="primary-btn"
              :disabled="!allAgreementsChecked || agreementLoading"
            >
              {{ agreementLoading ? "…" : "Submit request" }}
            </button>
          </div>
        </form>
      </section>

      <!-- My submissions (published) -->
      <section class="section">
        <button
          type="button"
          class="section-title section-toggle"
          :aria-expanded="mySubmissionsOpen"
          @click="mySubmissionsOpen = !mySubmissionsOpen"
        >
          <span class="caret">{{ mySubmissionsOpen ? "▾" : "▸" }}</span>
          My submissions
          <span v-if="publishedSubmissions.length" class="count">{{
            publishedSubmissions.length
          }}</span>
        </button>
        <template v-if="mySubmissionsOpen">
          <div v-if="!publishedSubmissions.length" class="empty">
            No approved submissions yet.
          </div>
          <ul v-else class="simple-list">
            <li
              v-for="r in publishedSubmissions"
              :key="r.id"
              class="simple-row"
            >
              <div class="simple-main">
                <NuxtLink class="simple-title link" :to="`/r/${r.slug}`">{{
                  r.name
                }}</NuxtLink>
                <span class="simple-meta">{{ r.date }} · {{ r.location }}</span>
                <span v-if="r.removalRequested" class="simple-meta"
                  >Removal requested</span
                >

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
                      :disabled="submissionActionId === r.id"
                      @click="submitRemovalRequest(r.slug)"
                    >
                      {{ submissionActionId === r.id ? "…" : "Submit" }}
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
        </template>
      </section>

      <!-- Pending submissions -->
      <section v-if="pendingAndRejectedSubmissions.length" class="section">
        <button
          type="button"
          class="section-title section-toggle"
          :aria-expanded="pendingSubmissionsOpen"
          @click="pendingSubmissionsOpen = !pendingSubmissionsOpen"
        >
          <span class="caret">{{ pendingSubmissionsOpen ? "▾" : "▸" }}</span>
          Pending submissions
          <span class="count">{{ pendingAndRejectedSubmissions.length }}</span>
        </button>
        <template v-if="pendingSubmissionsOpen">
          <ul class="simple-list">
            <li
              v-for="r in pendingAndRejectedSubmissions"
              :key="r.id"
              class="simple-row"
            >
              <div class="simple-main">
                <span class="simple-title">{{ r.name }}</span>
                <span class="simple-meta"
                  >{{ r.date }} · {{ r.location }} ·
                  {{ submissionStatusLabel(r.status) }}</span
                >
                <span
                  v-if="r.status === 'rejected' && r.rejectionMessage"
                  class="simple-meta rejection-msg"
                  >{{ r.rejectionMessage }}</span
                >
              </div>
              <div class="simple-actions">
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="submissionActionId === r.id"
                  :title="
                    r.status === 'pending' ? 'Withdraw submission' : 'Remove'
                  "
                  @click="dismissRejectedSubmission(r.slug, r.id, r.status)"
                >
                  {{ submissionActionId === r.id ? "…" : "✕" }}
                </button>
              </div>
            </li>
          </ul>
        </template>
      </section>

      <!-- My annotations -->
      <section class="section">
        <button
          type="button"
          class="section-title section-toggle"
          :aria-expanded="myAnnotationsOpen"
          @click="myAnnotationsOpen = !myAnnotationsOpen"
        >
          <span class="caret">{{ myAnnotationsOpen ? "▾" : "▸" }}</span>
          My annotations
          <span v-if="myAnnotations?.length" class="count">{{
            myAnnotations.length
          }}</span>
        </button>
        <template v-if="myAnnotationsOpen">
          <div v-if="!myAnnotations?.length" class="empty">
            No annotations yet.
          </div>
          <ul v-else class="simple-list">
            <li v-for="a in myAnnotations" :key="a.id" class="simple-row">
              <div class="simple-main">
                <NuxtLink
                  class="simple-title link"
                  :to="`/r/${a.restroomSlug}`"
                  >{{ a.restroomName }}</NuxtLink
                >
                <span class="simple-meta annotation-body">{{ a.body }}</span>
                <span class="simple-meta"
                  >{{ a.restroomDate }} · {{ a.restroomLocation }}</span
                >
              </div>
              <div class="simple-actions">
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="annotationActionId === a.id"
                  title="Delete annotation"
                  @click="deleteMyAnnotation(a.restroomSlug, a.id)"
                >
                  {{ annotationActionId === a.id ? "…" : "✕" }}
                </button>
              </div>
            </li>
          </ul>
        </template>
      </section>

      <!-- Admin queues -->
      <template v-if="isAdmin">
        <p v-if="actionError" class="form-error action-error">
          {{ actionError }}
        </p>

        <section class="section">
          <h2 class="section-title">
            Pending submissions
            <span v-if="pendingRestrooms?.length" class="count">{{
              pendingRestrooms.length
            }}</span>
          </h2>

          <div v-if="!pendingRestrooms?.length" class="empty">
            No submissions pending.
          </div>

          <div v-else class="queue">
            <div v-for="r in pendingRestrooms" :key="r.id" class="card">
              <button
                type="button"
                class="card-header card-toggle"
                :class="{ active: expandedPendingId === r.id }"
                :aria-expanded="expandedPendingId === r.id"
                @click="togglePendingExpand(r.id)"
              >
                <span class="caret">{{
                  expandedPendingId === r.id ? "▾" : "▸"
                }}</span>
                <span class="card-name">{{ r.name }}</span>
                <span class="card-meta">{{ r.date }} · {{ r.location }}</span>
              </button>

              <template v-if="expandedPendingId === r.id">
                <dl class="card-details">
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
                <div v-else class="card-actions">
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
                  <button type="button" class="btn" @click="select(r.slug)">
                    Preview in viewer
                  </button>
                </div>
              </template>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">
            Pending accounts
            <span v-if="pendingUsers?.length" class="count">{{
              pendingUsers.length
            }}</span>
          </h2>

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
        </section>

        <section class="section">
          <h2 class="section-title">
            Accounts
            <span v-if="accounts?.length" class="count">{{
              accounts.length
            }}</span>
          </h2>

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
                    >@{{ a.username }} · {{ a.email }} ·
                    {{ accountStatusLabel(a) }}</span
                  >
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
                    {{ optionsAccountId === a.id ? "Close" : "Options" }}
                  </button>
                </div>
              </div>

              <div v-if="optionsAccountId === a.id" class="account-options">
                <label class="field">
                  <span class="field-label">Message (optional)</span>
                  <textarea
                    v-model="optionsMessage"
                    class="field-input field-textarea"
                    rows="2"
                    maxlength="500"
                    placeholder="Shown at the top of their account in red"
                  />
                </label>

                <div v-if="renamingAccountId === a.id" class="rename-row">
                  <input
                    v-model="renameDraft"
                    type="text"
                    minlength="3"
                    maxlength="20"
                    pattern="[a-z0-9_]+"
                    class="field-input rename-input"
                    placeholder="new_username"
                  />
                  <button
                    type="button"
                    class="btn btn-publish"
                    :disabled="actionLoading === `acct-${a.id}-rename`"
                    @click="submitRename(a)"
                  >
                    {{ actionLoading === `acct-${a.id}-rename` ? "…" : "Save" }}
                  </button>
                  <button
                    type="button"
                    class="link-btn"
                    @click="renamingAccountId = null"
                  >
                    Cancel
                  </button>
                  <p v-if="renameError" class="form-error">{{ renameError }}</p>
                </div>
                <button
                  v-else-if="a.id !== (user as any)?.id"
                  type="button"
                  class="btn rename-btn"
                  @click="startRename(a)"
                >
                  Rename @{{ a.username }}
                </button>

                <div class="account-options-actions">
                  <button
                    v-if="a.role !== 'admin'"
                    type="button"
                    class="btn btn-publish"
                    :disabled="actionLoading === `acct-${a.id}-promote`"
                    @click="promoteAccount(a)"
                  >
                    {{
                      actionLoading === `acct-${a.id}-promote`
                        ? "…"
                        : "Promote to admin"
                    }}
                  </button>

                  <button
                    v-if="a.role !== 'admin' && a.approvedAt"
                    type="button"
                    class="btn"
                    :disabled="actionLoading === `acct-${a.id}-revoke`"
                    @click="revokeSubmissionAccess(a)"
                  >
                    {{
                      actionLoading === `acct-${a.id}-revoke`
                        ? "…"
                        : "Revoke submission access"
                    }}
                  </button>
                  <button
                    v-else-if="a.role !== 'admin'"
                    type="button"
                    class="btn btn-publish"
                    :disabled="actionLoading === `acct-${a.id}-grant`"
                    @click="grantSubmissionAccess(a)"
                  >
                    {{
                      actionLoading === `acct-${a.id}-grant`
                        ? "…"
                        : "Grant submission access"
                    }}
                  </button>

                  <div v-if="a.role !== 'admin'" class="mute-row">
                    <button
                      v-if="isAccountMuted(a)"
                      type="button"
                      class="btn"
                      :disabled="actionLoading === `acct-${a.id}-unmute`"
                      @click="unmuteAccount(a)"
                    >
                      {{
                        actionLoading === `acct-${a.id}-unmute` ? "…" : "Unmute"
                      }}
                    </button>
                    <template v-else>
                      <input
                        v-model.number="optionsMuteDays"
                        type="number"
                        min="1"
                        max="3650"
                        class="field-input mute-days"
                        placeholder="days"
                      />
                      <button
                        type="button"
                        class="btn"
                        :disabled="actionLoading === `acct-${a.id}-mute`"
                        @click="muteAccount(a)"
                      >
                        {{
                          actionLoading === `acct-${a.id}-mute` ? "…" : "Mute"
                        }}
                      </button>
                    </template>
                  </div>

                  <button
                    v-if="a.role !== 'admin' && !a.bannedAt"
                    type="button"
                    class="btn btn-reject"
                    :disabled="actionLoading === `acct-${a.id}-ban`"
                    @click="banAccount(a)"
                  >
                    {{
                      actionLoading === `acct-${a.id}-ban`
                        ? "…"
                        : "Ban account permanently"
                    }}
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section class="section">
          <h2 class="section-title">
            Removal requests
            <span v-if="removalRequests?.length" class="count">{{
              removalRequests.length
            }}</span>
          </h2>

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
                  :disabled="actionLoading === `rm-reject-${r.id}`"
                  @click="removeRestroom(r.id)"
                >
                  {{ actionLoading === `rm-reject-${r.id}` ? "…" : "Remove" }}
                </button>
                <button
                  type="button"
                  class="btn"
                  :disabled="actionLoading === `rm-dismiss-${r.id}`"
                  @click="dismissRemoval(r.id)"
                >
                  {{ actionLoading === `rm-dismiss-${r.id}` ? "…" : "Dismiss" }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  color: #000;
  overflow: hidden;
}
.body-section {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px;
}

/* Header */
.account-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #000;
  padding-bottom: 8px;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.account-identity {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.account-header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.account-email {
  font-size: 16px;
}
.account-role {
  font-size: 14px;
  color: #b3b3b3;
}
.dn-edit-btn {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  line-height: 1;
}
.dn-edit-btn:hover {
  color: #000;
}
.dn-inline-form {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dn-input {
  font: inherit;
  font-size: 15px;
  border: 0;
  border-bottom: 1px solid #000;
  outline: none;
  padding: 1px 0;
  width: 160px;
  background: transparent;
}
.dn-btn {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  color: #000;
}
.dn-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dn-cancel {
  color: #999;
}
.dn-cancel:hover {
  color: #000;
}
.dn-error {
  margin: 2px 0 0;
  font-size: 11px;
}
.dim {
  color: #999;
}
.rename-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}
.rename-input {
  width: 200px;
  border: 1px solid #000;
  padding: 4px 6px;
  font-size: 14px;
}
.rename-btn {
  align-self: flex-start;
}

.awaiting {
  background: #f4f4f4;
  padding: 16px;
  font-size: 14px;
  color: #000;
  margin-bottom: 24px;
}
.awaiting p {
  margin: 0;
}
.muted-banner {
  background: #fff4e5;
}

/* Admin message banner */
.admin-message-banner {
  background: #c33;
  color: #fff;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.4;
  margin-bottom: 16px;
}
.admin-message-banner strong {
  font-weight: 700;
  margin-right: 4px;
}

/* Sign-up intro */
.signup-intro {
  margin-bottom: 24px;
  /* max-width: 380px; */
}
.signup-intro-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 400;
}
.signup-intro p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

/* Submission access request */
.request-cta {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 380px;
}
.request-cta-copy {
  margin: 0;
  font-size: 14px;
  color: #666;
}
.agreement-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 520px;
}
.agreement-intro {
  margin: 0;
  font-size: 14px;
}
.agreement-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
}
.agreement-check {
  margin-top: 3px;
  flex-shrink: 0;
}
.agreement-note {
  margin: 4px 0 0;
  font-size: 13px;
  color: #666;
}
.agreement-actions {
  display: flex;
  gap: 16px;
  align-items: center;
}

/* Auth tabs */
.auth-tabs {
  display: flex;
  margin-bottom: 24px;
  border-bottom: 1px solid #000;
}
.tab-btn {
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 8px 16px;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  color: #b3b3b3;
}
.tab-btn.active {
  color: #000;
  border-bottom-color: #000;
}

/* Shared form */
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 380px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 14px;
  color: #666;
}
.req {
  color: #000;
}
.field-input {
  border: 0;
  border-bottom: 1px solid #000;
  padding: 4px 0;
  font: inherit;
  font-size: 16px;
  background: transparent;
  outline: none;
  color: #000;
}
.field-textarea {
  resize: vertical;
  border: 1px solid #000;
  padding: 6px;
}
.char-count {
  font-size: 12px;
  color: #999;
  text-align: right;
}
.field-hint {
  margin: 0;
  font-size: 12px;
  color: #999;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.turnstile {
  margin: 4px 0;
}
.form-error {
  margin: 0;
  font-size: 14px;
  color: #c33;
}
.action-error {
  margin-bottom: 16px;
}

.primary-btn {
  background: #000;
  color: #fff;
  border: 0;
  padding: 10px 24px;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  align-self: flex-start;
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary-btn:hover:not(:disabled) {
  background: #333;
}

.success-message {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-btn {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}

/* Admin sections */
.section {
  margin-top: 40px;
}
.section-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 400;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #000;
  padding-bottom: 4px;
}
.section-toggle {
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #000;
  text-align: left;
  font: inherit;
  font-size: 18px;
  cursor: pointer;
  color: inherit;
}
.section-toggle:hover {
  background: #f4f4f4;
}
.caret {
  display: inline-block;
  width: 12px;
  font-size: 12px;
  color: #666;
}
.count {
  font-size: 12px;
  background: #000;
  color: #fff;
  border-radius: 999px;
  padding: 1px 8px;
}
.empty {
  color: #666;
  font-size: 14px;
}
.queue {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.card {
  border: 1px solid #000;
}
.card-header {
  padding: 12px 16px;
  border-bottom: 1px solid #000;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-toggle {
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #000;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.card-toggle:hover {
  background: #f4f4f4;
}
.card-toggle.active {
  background: #f4f4f4;
}
.card-name {
  font-size: 16px;
}
.card-meta {
  font-size: 13px;
  color: #666;
}
.preview-warning {
  margin: 8px 16px 12px;
  font-size: 12px;
  color: #c33;
  font-style: italic;
}
.card-details {
  margin: 0;
  padding: 12px 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  font-size: 14px;
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
  line-height: 1.4;
}
.admin-tag {
  display: inline-block;
  background: #000;
  color: #fff;
  font-size: 12px;
  line-height: 1.2;
  padding: 2px 6px;
  margin-right: 4px;
  margin-bottom: 4px;
  border-radius: 0;
}
.card-actions {
  padding: 12px 16px;
  border-top: 1px solid #000;
  display: flex;
  gap: 12px;
}
.btn {
  background: transparent;
  border: 1px solid #000;
  padding: 6px 20px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-publish:hover:not(:disabled) {
  background: #000;
  color: #fff;
}
.btn-reject:hover:not(:disabled) {
  background: #c33;
  border-color: #c33;
  color: #fff;
}

.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid #000;
}
.simple-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #000;
}
.simple-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.simple-title {
  font-size: 15px;
}
.simple-title.link {
  color: #000;
  text-decoration: underline;
}
.simple-meta {
  font-size: 13px;
  color: #666;
}
.simple-meta.reason {
  color: #000;
}
.simple-meta.annotation-body {
  color: #000;
  white-space: pre-wrap;
}
.simple-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
}

.icon-btn {
  background: transparent;
  border: 1px solid #000;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  color: #000;
}
.icon-btn:hover:not(:disabled) {
  background: #c33;
  color: #fff;
  border-color: #c33;
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inline-removal-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.inline-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* Admin accounts list */
.account-row {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #000;
}
.account-row > .simple-row {
  border-bottom: 0;
}
.btn.active {
  background: #000;
  color: #fff;
}
.account-options {
  padding: 12px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px dashed #ccc;
}
.account-options-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.mute-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.mute-days {
  width: 80px;
  border: 1px solid #000;
  padding: 4px 6px;
  font-size: 14px;
}
.admin-msg-preview {
  color: #c33;
  font-style: italic;
}
.rejection-msg {
  color: #c33;
  font-style: italic;
}
.inline-reject-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0 6px;
}

@media (max-width: 750px) {
  .account-page {
    font-size: 12px;
  }
  .body-section {
    padding: 12px;
  }
  .tab-btn {
    font-size: 12px;
    padding: 8px 10px;
  }
  .field-input {
    font-size: 16px; /* keep 16px — iOS zooms into inputs below 16px */
  }
  .primary-btn {
    font-size: 12px;
  }
  .section-title {
    font-size: 14px;
  }
}
</style>
