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
const { previewModelUrl, hasUnsavedSubmission } = useSubmissionPreview();

// No controls strip on this page, so the first header rule grows to meet the
// layout's `.expand-tab` instead of the tab measuring itself against a strip.
// `alignEl` is whichever tabs row is mounted: the logged-out auth tabs, or the
// logged-in account tabs.
const pageEl = ref<HTMLElement | null>(null);
const alignEl = ref<HTMLElement | null>(null);
const alignStyle = useAlignToStrip(pageEl, alignEl);

const SUBMISSION_AGREEMENTS = [
  "Scans will be complete and without too many holes (excluding mirrored surfaces).",
  "Scans will be cropped to remove any false spaces caused by reflective surfaces.",
  "Toilets must be flushed before scanning.",
  "I will avoid scanning restrooms that aren't private/ a single room. I will never scan if there are other people present.",
  "I will use my best judgement when submitting. I won't submit anything too traumatizing or gross.",
  "I agree to always be respectful.",
];

// -------------- Auth form (logged-out) --------------
// Sign in, or create a new account. New accounts start as Annotators and can
// request submission access ("Archivist") from their account page afterwards.
const authTab = ref<"signin" | "signup">("signin");
const email = ref("");
const password = ref("");
const username = ref("");
const displayName = ref("");
const turnstileToken = ref("");
const authError = ref("");
const authLoading = ref(false);

// Turnstile sometimes paints its "success" UI a beat before the token reaches
// the v-model ref. Wait briefly so a fast Enter-key submit (or password manager
// autofill) doesn't race past it. Returns false if no token ever arrives.
async function waitForToken(tokenRef: Ref<string>) {
  for (let i = 0; i < 20 && !tokenRef.value; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return !!tokenRef.value;
}

async function submitAuth() {
  if (!(await waitForToken(turnstileToken))) {
    authError.value = "Still verifying — please wait a moment and try again.";
    return;
  }
  authError.value = "";
  authLoading.value = true;
  try {
    const url =
      authTab.value === "signin" ? "/api/auth/signin" : "/api/auth/signup";
    const body: Record<string, unknown> = {
      email: email.value,
      password: password.value,
      turnstileToken: turnstileToken.value,
    };
    if (authTab.value === "signup") {
      body.username = username.value;
      if (displayName.value) body.displayName = displayName.value;
    }
    await $fetch(url, { method: "POST", body });
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
  if (tab === "signin") {
    username.value = "";
    displayName.value = "";
  }
}

// -------------- Change password --------------
const changingPassword = ref(false);
const currentPasswordDraft = ref("");
const newPasswordDraft = ref("");
const confirmPasswordDraft = ref("");
const passwordLoading = ref(false);
const passwordError = ref("");
const passwordSuccess = ref(false);

function startChangePassword() {
  changingPassword.value = true;
  currentPasswordDraft.value = "";
  newPasswordDraft.value = "";
  confirmPasswordDraft.value = "";
  passwordError.value = "";
  passwordSuccess.value = false;
}

function cancelChangePassword() {
  changingPassword.value = false;
  currentPasswordDraft.value = "";
  newPasswordDraft.value = "";
  confirmPasswordDraft.value = "";
  passwordError.value = "";
}

// -------------- Change email --------------
const changingEmail = ref(false);
const emailDraft = ref("");
const emailPasswordDraft = ref("");
const emailLoading = ref(false);
const emailError = ref("");
const emailSuccess = ref(false);

function startChangeEmail() {
  changingEmail.value = true;
  emailDraft.value = user.value?.email ?? "";
  emailPasswordDraft.value = "";
  emailError.value = "";
  emailSuccess.value = false;
}

function cancelChangeEmail() {
  changingEmail.value = false;
  emailDraft.value = "";
  emailPasswordDraft.value = "";
  emailError.value = "";
}

async function saveNewEmail() {
  emailLoading.value = true;
  emailError.value = "";
  try {
    await $fetch("/api/me/email", {
      method: "PATCH",
      body: {
        email: emailDraft.value,
        currentPassword: emailPasswordDraft.value,
      },
    });
    await refreshSession();
    changingEmail.value = false;
    emailPasswordDraft.value = "";
    emailSuccess.value = true;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    emailError.value = err.data?.statusMessage ?? "Could not update email.";
  } finally {
    emailLoading.value = false;
  }
}

// -------------- Delete account --------------
const deletingAccount = ref(false);
const deletePasswordDraft = ref("");
const deleteUsernameConfirm = ref("");
const deleteLoading = ref(false);
const deleteError = ref("");

function startDeleteAccount() {
  deletingAccount.value = true;
  deletePasswordDraft.value = "";
  deleteUsernameConfirm.value = "";
  deleteError.value = "";
}

function cancelDeleteAccount() {
  deletingAccount.value = false;
  deletePasswordDraft.value = "";
  deleteUsernameConfirm.value = "";
  deleteError.value = "";
}

async function confirmDeleteAccount() {
  const expectedUsername = user.value?.username;
  if (!expectedUsername) return;
  if (deleteUsernameConfirm.value !== expectedUsername) {
    deleteError.value = "Username doesn't match.";
    return;
  }
  deleteLoading.value = true;
  deleteError.value = "";
  try {
    await $fetch("/api/me/delete", {
      method: "POST",
      body: { password: deletePasswordDraft.value },
    });
  } catch (e: unknown) {
    // Fall through the response body first, then the fetch error itself — a 500
    // from Nitro has no `statusMessage`, and without the fallbacks every server
    // fault reads as the same useless "Could not delete account."
    const err = e as {
      data?: { statusMessage?: string; message?: string } | string;
      statusMessage?: string;
      message?: string;
    };
    const fromBody =
      typeof err.data === "object" && err.data
        ? (err.data.statusMessage ?? err.data.message)
        : undefined;
    deleteError.value =
      fromBody ||
      err.statusMessage ||
      err.message ||
      "Could not delete account.";
    return;
  } finally {
    deleteLoading.value = false;
  }
  // Past this point the account is gone and the server has already cleared the
  // session, so a failure here is a navigation problem — keeping it inside the
  // try above reported a successful delete as "Could not delete account."
  await refreshSession();
  await navigateTo("/");
}

async function saveNewPassword() {
  if (newPasswordDraft.value.length < 8) {
    passwordError.value = "Password must be at least 8 characters.";
    return;
  }
  if (newPasswordDraft.value !== confirmPasswordDraft.value) {
    passwordError.value = "Passwords do not match.";
    return;
  }
  passwordLoading.value = true;
  passwordError.value = "";
  try {
    await $fetch("/api/me/password", {
      method: "PATCH",
      body: {
        currentPassword: currentPasswordDraft.value,
        newPassword: newPasswordDraft.value,
      },
    });
    passwordSuccess.value = true;
    changingPassword.value = false;
    currentPasswordDraft.value = "";
    newPasswordDraft.value = "";
    confirmPasswordDraft.value = "";
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    passwordError.value =
      err.data?.statusMessage ?? "Could not update password.";
  } finally {
    passwordLoading.value = false;
  }
}

// -------------- Display name editor --------------
const editingDisplayName = ref(false);
const displayNameDraft = ref("");
const displayNameLoading = ref(false);
const displayNameError = ref("");
const dnInput = ref<HTMLInputElement | null>(null);

function startEditDisplayName() {
  displayNameDraft.value = user.value?.displayName ?? "";
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
async function onUploadSubmitted() {
  await refreshMySubmissions();
  if (isAdmin.value) {
    await Promise.all([refreshRestroomQueue(), refreshNuxtData("restrooms")]);
  }
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
  if (status === "removed") return "Removed at your request";
  if (status === "removal_requested") return "Removal requested";
  return status;
}

const publishedSubmissions = computed(() =>
  (mySubmissions.value ?? []).filter(
    (r) => r.status === "published" || r.status === "removal_requested",
  ),
);

// Everything that isn't live in the archive: awaiting review, turned down, or
// taken down after a removal request.
const inactiveSubmissions = computed(() =>
  (mySubmissions.value ?? []).filter(
    (r) =>
      r.status === "pending" ||
      r.status === "rejected" ||
      r.status === "hidden" ||
      r.status === "removed",
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
      : "Clear this submission from your list?";
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
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Could not hide annotation.";
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
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Could not dismiss reports.";
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
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Could not hide annotation.";
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
    const err = e as { data?: { statusMessage?: string } };
    actionError.value =
      err.data?.statusMessage ?? "Could not unhide annotation.";
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
  // A rename left open on another account shouldn't greet you on this one.
  renamingAccountId.value = null;
  renameError.value = "";
}

function isAccountMuted(account: AccountRow): boolean {
  if (!account.mutedUntil) return false;
  const ms = Date.parse(`${account.mutedUntil.replace(" ", "T")}Z`);
  return Number.isFinite(ms) && ms > Date.now();
}

// SQLite hands these back as `YYYY-MM-DD HH:MM:SS` in UTC; a raw one in the
// middle of a sentence reads like debug output.
function formatAdminDate(value: string | null): string {
  if (!value) return "";
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(ms)) return value;
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${day} ${month} ${d.getUTCFullYear()}`;
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
      label: `Suspended until ${formatAdminDate(account.mutedUntil)}`,
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
    const err = e as { data?: { statusMessage?: string } };
    actionError.value = err.data?.statusMessage ?? "Delete failed.";
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
    const err = e as { data?: { statusMessage?: string } };
    renameError.value = err.data?.statusMessage ?? "Rename failed.";
  } finally {
    actionLoading.value = null;
  }
}

// The signed-in user's own handle. Named to avoid colliding with the
// `username` ref backing the sign-up form.
const myUsername = computed(() => user.value?.username ?? "");

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

const adminSubTabs = computed(() => [
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

const submissionsSubTabs = computed(() => [
  { id: "new", label: "New" },
  {
    id: "published",
    label: "Published",
    count: publishedSubmissions.value.length,
  },
  {
    id: "pending",
    label: "Pending",
    count: inactiveSubmissions.value.length,
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

    <!-- Logged-out: auth forms -->
    <div v-if="!loggedIn" class="body-section thin-scroll">
      <div ref="alignEl" class="auth-tabs">
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

        <NuxtTurnstile
          v-model="turnstileToken"
          class="turnstile"
          :options="{ theme: 'light', appearance: 'interaction-only' }"
        />

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

        <NuxtLink
          v-if="authTab === 'signin'"
          to="/forgot-password"
          class="forgot-password-link"
        >
          Forgot your password?
        </NuxtLink>
      </form>
    </div>

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
      <nav ref="alignEl" class="account-tabs" role="tablist">
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
        <div class="settings-list form-column">
          <!-- Name -->
          <div class="settings-row">
            <span class="settings-label">Name</span>
            <template v-if="!editingDisplayName">
              <span class="settings-value">
                <template v-if="user?.displayName">{{
                  user.displayName
                }}</template>
                <span v-else class="dim">Not set</span>
              </span>
              <button
                type="button"
                class="btn settings-change"
                @click="startEditDisplayName"
              >
                Change
              </button>
            </template>
            <form
              v-else
              class="settings-edit"
              @submit.prevent="saveDisplayName"
            >
              <label class="field">
                <span class="field-label">Display name</span>
                <input
                  ref="dnInput"
                  v-model="displayNameDraft"
                  type="text"
                  maxlength="25"
                  class="field-input"
                  placeholder="Blank to clear"
                  @keydown.esc="editingDisplayName = false"
                />
                <span class="field-hint"
                  >Shown instead of @{{ user?.username }}.</span
                >
              </label>
              <p v-if="displayNameError" class="form-error">
                {{ displayNameError }}
              </p>
              <div class="settings-edit-actions">
                <button
                  type="submit"
                  class="primary-btn btn-sm"
                  :disabled="displayNameLoading"
                >
                  {{ displayNameLoading ? "…" : "Save" }}
                </button>
                <button
                  type="button"
                  class="link-btn"
                  @click="editingDisplayName = false"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <!-- Email -->
          <div class="settings-row">
            <span class="settings-label">Email</span>
            <template v-if="!changingEmail">
              <span class="settings-value">{{ user?.email }}</span>
              <span v-if="emailSuccess" class="password-success">Updated.</span>
              <button
                type="button"
                class="btn settings-change"
                @click="startChangeEmail"
              >
                Change
              </button>
            </template>
            <form v-else class="settings-edit" @submit.prevent="saveNewEmail">
              <label class="field">
                <span class="field-label">New email</span>
                <input
                  v-model="emailDraft"
                  type="email"
                  required
                  autocomplete="email"
                  class="field-input"
                />
              </label>
              <label class="field">
                <span class="field-label">Current password</span>
                <input
                  v-model="emailPasswordDraft"
                  type="password"
                  required
                  autocomplete="current-password"
                  class="field-input"
                />
                <span class="field-hint"
                  >Confirm it's you before changing your email.</span
                >
              </label>
              <p v-if="emailError" class="form-error">{{ emailError }}</p>
              <div class="settings-edit-actions">
                <button
                  type="submit"
                  class="primary-btn btn-sm"
                  :disabled="emailLoading"
                >
                  {{ emailLoading ? "Saving…" : "Update email" }}
                </button>
                <button
                  type="button"
                  class="link-btn"
                  :disabled="emailLoading"
                  @click="cancelChangeEmail"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <!-- Password -->
          <div class="settings-row">
            <span class="settings-label">Password</span>
            <template v-if="!changingPassword">
              <span class="settings-value settings-dots">••••••••••</span>
              <span v-if="passwordSuccess" class="password-success"
                >Updated.</span
              >
              <button
                type="button"
                class="btn settings-change"
                @click="startChangePassword"
              >
                Change
              </button>
            </template>
            <form
              v-else
              class="settings-edit"
              @submit.prevent="saveNewPassword"
            >
              <label class="field">
                <span class="field-label">Current password</span>
                <input
                  v-model="currentPasswordDraft"
                  type="password"
                  autocomplete="current-password"
                  required
                  class="field-input"
                />
              </label>
              <label class="field">
                <span class="field-label">New password</span>
                <input
                  v-model="newPasswordDraft"
                  type="password"
                  autocomplete="new-password"
                  required
                  minlength="8"
                  class="field-input"
                />
                <span class="field-hint">Minimum 8 characters.</span>
              </label>
              <label class="field">
                <span class="field-label">Confirm new password</span>
                <input
                  v-model="confirmPasswordDraft"
                  type="password"
                  autocomplete="new-password"
                  required
                  minlength="8"
                  class="field-input"
                />
              </label>
              <p v-if="passwordError" class="form-error">
                {{ passwordError }}
              </p>
              <div class="settings-edit-actions">
                <button
                  type="submit"
                  class="primary-btn btn-sm"
                  :disabled="passwordLoading"
                >
                  {{ passwordLoading ? "Saving…" : "Update password" }}
                </button>
                <button
                  type="button"
                  class="link-btn"
                  :disabled="passwordLoading"
                  @click="cancelChangePassword"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <!-- Delete account. Self-service and immediate — no admin approval
               step sits behind this, so the label mustn't imply one. -->
          <div v-if="!isAdmin" class="settings-row settings-row-danger">
            <span class="settings-label">Delete</span>
            <template v-if="!deletingAccount">
              <span class="settings-value dim"
                >Permanently remove your account</span
              >
              <button
                type="button"
                class="btn btn-danger-outline settings-change"
                @click="startDeleteAccount"
              >
                Delete account
              </button>
            </template>
            <form
              v-else
              class="settings-edit"
              @submit.prevent="confirmDeleteAccount"
            >
              <p class="danger-warning">
                This will permanently remove your account, your annotations, and
                any pending submissions. Published restrooms you submitted will
                stay in the archive but will no longer show your name.
                <strong>This cannot be undone.</strong>
              </p>
              <label class="field">
                <span class="field-label">
                  Type your username
                  <code class="confirm-code">{{ myUsername }}</code>
                  to confirm
                </span>
                <input
                  v-model="deleteUsernameConfirm"
                  type="text"
                  autocomplete="off"
                  required
                  class="field-input"
                />
              </label>
              <label class="field">
                <span class="field-label">Current password</span>
                <input
                  v-model="deletePasswordDraft"
                  type="password"
                  autocomplete="current-password"
                  required
                  class="field-input"
                />
              </label>
              <p v-if="deleteError" class="form-error">{{ deleteError }}</p>
              <div class="settings-edit-actions">
                <button
                  type="submit"
                  class="danger-btn btn-sm"
                  :disabled="deleteLoading"
                >
                  {{
                    deleteLoading ? "Deleting…" : "Permanently delete account"
                  }}
                </button>
                <button
                  type="button"
                  class="link-btn"
                  :disabled="deleteLoading"
                  @click="cancelDeleteAccount"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Submissions -->
      <div
        v-if="accountTab === 'submissions'"
        class="tab-panel"
        role="tabpanel"
      >
        <p v-if="myActionError" class="form-error action-error">
          {{ myActionError }}
        </p>

        <!-- New submission -->
        <div v-show="submissionsSection === 'new'">
          <!-- Approved: submit form -->
          <SubmitWizard v-if="canSubmit" @submitted="onUploadSubmitted" />

          <!-- Awaiting submission approval -->
          <div v-else-if="submissionRequested" class="awaiting">
            <p>
              Your request to submit restrooms is awaiting admin review. You can
              leave annotations on any restroom in the meantime.
            </p>
          </div>

          <!-- Submission access request flow -->
          <div v-else class="form-column">
            <div v-if="!showAgreementForm" class="request-cta">
              <p class="request-cta-copy">
                You can leave annotations on any restroom. To submit your own
                restroom scans, request access below.
              </p>
              <button
                type="button"
                class="primary-btn"
                @click="openAgreementForm"
              >
                Request access to submit restroom scans
              </button>
            </div>

            <form
              v-else
              class="agreement-form"
              @submit.prevent="submitAgreement"
            >
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
                Admins reserve the right to deny, remove, and edit any
                submissions as they see fit, without notice. By submitting this
                request, you agree to these terms.
              </p>

              <p v-if="agreementError" class="form-error">
                {{ agreementError }}
              </p>

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
          </div>
        </div>

        <!-- Published -->
        <div v-show="submissionsSection === 'published'">
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
        </div>

        <!-- Pending -->
        <div v-show="submissionsSection === 'pending'">
          <div v-if="!inactiveSubmissions.length" class="empty">
            Nothing awaiting review.
          </div>
          <ul v-else class="simple-list">
            <li v-for="r in inactiveSubmissions" :key="r.id" class="simple-row">
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
                    r.status === 'pending'
                      ? 'Withdraw submission'
                      : 'Clear from list'
                  "
                  @click="dismissRejectedSubmission(r.slug, r.id, r.status)"
                >
                  {{ submissionActionId === r.id ? "…" : "✕" }}
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Annotations -->
      <div
        v-if="accountTab === 'annotations'"
        class="tab-panel"
        role="tabpanel"
      >
        <p v-if="myActionError" class="form-error action-error">
          {{ myActionError }}
        </p>

        <!-- My annotations -->
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
                          >Until {{ formatAdminDate(a.mutedUntil) }}</template
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
                          >Banned {{ formatAdminDate(a.bannedAt) }}</template
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
   gutter back as padding, so the borders span the panel like the catalog's
   sub-header while the content stays on the same left edge as everything else. */
.account-header,
.account-tabs,
.auth-tabs {
  margin-inline: calc(-1 * var(--gutter));
  padding-inline: var(--gutter);
}

/* The first row closes the gutter above it too, so the band it starts starts
   flush under the site header's border — the catalog's `.controls` starts
   flush under the header the same way. Skipped when the admin banner takes
   first place, since the row is then not what the tab frames. */
.body-section > .account-header:first-child,
.body-section > .auth-tabs:first-child {
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
.form-column {
  max-width: 480px;
}
.dim {
  color: #999;
}

/* Auth tabs — underlined, sentence case, weight 400, like the catalog nav.
   Logged-out only; they're the first header row, so they're what grows to end
   level with the expand tab — see useAlignToStrip. The buttons stretch with
   the row, keeping the active underline on the rule. */
.auth-tabs {
  display: flex;
  margin-bottom: 16px;
  border-bottom: 1px solid #000;
  overflow-x: auto;
  box-sizing: border-box;
  min-height: var(--strip-align-height, 0px);
}
.tab-btn {
  background: transparent;
  border: 0;
  border-bottom: 1px solid transparent;
  margin-bottom: -1px;
  padding: 6px 14px 7px;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
  color: #999;
}
.tab-btn:first-child {
  padding-left: 0;
}
.tab-btn:hover:not(.active) {
  color: #595959;
}
.tab-btn.active {
  color: #000;
  border-bottom-color: #000;
}

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
.settings-list {
  display: flex;
  flex-direction: column;
}
.settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 12px;
  padding: 12px 0;
  border-bottom: 1px solid #e8e8e8;
}
.settings-row:last-child {
  border-bottom: 0;
}
.settings-label {
  flex: 1 1 100%;
  font-size: 12px;
  color: #666;
}
.settings-value {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
}
.settings-dots {
  letter-spacing: 2px;
}
.settings-change {
  flex: 0 0 auto;
  margin-left: auto;
}
.settings-edit {
  flex: 1 1 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
  max-width: 340px;
}
.settings-edit-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
/* Explains what a row's action does, on its own line under it — the row is
   `flex-wrap`, so a full-basis child always breaks below the button. */
.settings-note {
  flex: 1 1 100%;
  margin-top: 2px;
  font-size: 11px;
  color: #999;
}
/* Rows whose action can't be walked back. Only the label carries the colour —
   a full red row would shout louder than a ban warrants at rest. */
.settings-row-danger .settings-label {
  color: #c33;
}
/* Named runs of rows. The heading is the micro step so it groups the rows
   without competing with their labels. */
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-group-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #999;
}

/* Banners */
.awaiting {
  background: #f4f4f4;
  padding: 12px;
  color: #000;
  margin-bottom: 16px;
}
.awaiting p {
  margin: 0;
}
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
.danger-warning {
  margin: 0;
  color: #000;
  background: #fbeaea;
  border-left: 3px solid #c33;
  padding: 8px 12px;
}

/* Sign-up intro */
.signup-intro {
  margin-bottom: 16px;
  max-width: 340px;
}
.signup-intro-title {
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #000;
  font-size: 15px;
  font-weight: 400;
}
.signup-intro p {
  margin: 0;
  font-size: 12px;
  color: #666;
}

/* Submission access request */
.request-cta {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.request-cta-copy {
  margin: 0;
  font-size: 12px;
  color: #666;
}
.agreement-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.agreement-intro {
  margin: 0;
}
.agreement-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
}
.agreement-check {
  margin-top: 2px;
  flex-shrink: 0;
}
.agreement-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: #666;
}
.agreement-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 4px;
}

/* Shared form */
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 340px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  color: #666;
}
.field-input {
  border: 1px solid #000;
  padding: 5px 6px;
  font: inherit;
  background: transparent;
  outline: none;
  color: #000;
}
.field-textarea {
  resize: vertical;
  padding: 6px;
}
.field-hint {
  margin: 0;
  font-size: 11px;
  color: #999;
}
.turnstile {
  margin: 4px 0;
}
.form-error {
  margin: 0;
  color: #c33;
}
.action-error {
  margin-bottom: 12px;
}
.password-success {
  color: #666;
  font-style: italic;
}

/* Buttons — row-level actions (Change, Save, Cancel, admin queue actions) sit
   at 12px with tight padding so they match the labels they sit beside rather
   than outweighing them. Only the primary/danger CTAs stay content-level. */
.primary-btn {
  background: #000;
  color: #fff;
  border: 0;
  padding: 8px 18px;
  font: inherit;
  cursor: pointer;
  align-self: flex-start;
}
.primary-btn:disabled,
.danger-btn:disabled,
.btn:disabled,
.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary-btn:hover:not(:disabled) {
  background: #333;
}
.danger-btn {
  background: #c33;
  color: #fff;
  border: 0;
  padding: 8px 18px;
  font: inherit;
  cursor: pointer;
  align-self: flex-start;
}
.danger-btn:hover:not(:disabled) {
  background: #a22;
}
.btn {
  background: transparent;
  border: 1px solid #000;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.btn.active {
  background: #000;
  color: #fff;
}
.btn-sm {
  padding: 3px 10px;
  font-size: 12px;
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
.btn-danger-outline {
  border: 1px solid #c33;
  color: #c33;
  background: transparent;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.btn-danger-outline:hover {
  background: #c33;
  color: #fff;
}
.btn-delete {
  border-color: #999;
  color: #666;
  font-size: 12px;
  padding: 3px 8px;
}
.btn-delete:hover:not(:disabled) {
  background: #c33;
  border-color: #c33;
  color: #fff;
}
.link-btn,
.forgot-password-link {
  background: transparent;
  border: 0;
  padding: 2px 4px;
  font: inherit;
  font-size: 12px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}
.forgot-password-link {
  padding: 0;
}
.icon-btn {
  background: transparent;
  border: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  color: #000;
}
.icon-btn:hover:not(:disabled) {
  color: #ff0000;
}

/* Counts, pills and chips — the micro step. */
.count {
  font-size: 11px;
  background: #000;
  color: #fff;
  border-radius: 6px;
  padding: 1px 6px;
}
.pill {
  display: inline-block;
  font-size: 11px;
  line-height: 1.4;
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: 4px;
  color: #fff;
}
.pill-hidden {
  background: #666;
}
.pill-reported {
  background: #c33;
}
/* Account status badges: filled = a standing fact about the account, outlined
   = something waiting on an admin. */
.pill-role {
  background: #000;
}
.pill-neutral {
  background: #999;
}
.pill-warn {
  background: #c60;
}
.pill-danger {
  background: #c33;
}
.pill-outline {
  background: transparent;
  color: #666;
  box-shadow: inset 0 0 0 1px #999;
}
.admin-tag {
  display: inline-block;
  background: #000;
  color: #fff;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 6px;
  margin: 0 4px 4px 0;
  border-radius: 0;
}
.empty {
  color: #666;
  font-size: 12px;
}

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
.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e8e8e8;
}
.simple-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #e8e8e8;
}
.simple-row.is-hidden .simple-main {
  opacity: 0.55;
}
.simple-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.simple-title.link {
  color: #000;
  text-decoration: underline;
}
.simple-meta {
  font-size: 12px;
  color: #666;
}
.simple-meta.reason,
.simple-meta.annotation-body {
  color: #000;
}
.simple-meta.annotation-body {
  white-space: pre-wrap;
}
.simple-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
}
.inline-removal-form,
.inline-reject-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inline-removal-form {
  margin-top: 8px;
}
.inline-reject-form {
  padding: 8px 0 4px;
}
.inline-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
.confirm-code {
  font-family: ui-monospace, Menlo, monospace;
  background: #f4f4f4;
  padding: 1px 5px;
  font-size: 12px;
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
.rejection-msg {
  color: #c33;
  font-style: italic;
}

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
  /* The tab moves to the panel's bottom edge here — nothing to align to, so
     the row keeps its natural height and the normal gutter above it. */
  .account-tabs,
  .auth-tabs {
    min-height: 0;
  }
  .body-section > .account-header:first-child,
  .body-section > .auth-tabs:first-child {
    margin-top: 0;
  }
  .field-input {
    font-size: 16px; /* keep 16px — iOS zooms into inputs below 16px */
  }
}
</style>
