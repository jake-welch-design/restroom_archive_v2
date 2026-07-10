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
// Sign-ups are invite-only during the beta: the second tab is an access
// application, not an account form. Approved applicants finish signing up via
// the emailed invite link (/join).
const authTab = ref<"signin" | "apply">("signin");
const email = ref("");
const password = ref("");
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
    await $fetch("/api/auth/signin", {
      method: "POST",
      body: {
        email: email.value,
        password: password.value,
        turnstileToken: turnstileToken.value,
      },
    });
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

// -------------- Beta-archivist access application --------------
const applyEmail = ref("");
const applyDisplayName = ref("");
const applySocials = ref("");
const applyFoundVia = ref("");
const applyReason = ref("");
const applyAgree = ref(false);
const applyToken = ref("");
const applyError = ref("");
const applyLoading = ref(false);
const applySubmitted = ref(false);

async function submitApplication() {
  if (!applyAgree.value) {
    applyError.value = "Please agree to the archivist terms to apply.";
    return;
  }
  if (!(await waitForToken(applyToken))) {
    applyError.value = "Still verifying — please wait a moment and try again.";
    return;
  }
  applyError.value = "";
  applyLoading.value = true;
  try {
    await $fetch("/api/beta/apply", {
      method: "POST",
      body: {
        email: applyEmail.value,
        displayName: applyDisplayName.value,
        socials: applySocials.value || undefined,
        foundVia: applyFoundVia.value,
        reason: applyReason.value,
        agreeTerms: applyAgree.value,
        turnstileToken: applyToken.value,
      },
    });
    applySubmitted.value = true;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    applyError.value =
      err.data?.statusMessage ?? err.message ?? "Something went wrong.";
    applyToken.value = "";
  } finally {
    applyLoading.value = false;
  }
}

function switchTab(tab: "signin" | "apply") {
  authTab.value = tab;
  authError.value = "";
  applyError.value = "";
  turnstileToken.value = "";
  applyToken.value = "";
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
  const expectedUsername = (user.value as { username?: string } | null)
    ?.username;
  if (!expectedUsername) return;
  if (deleteUsernameConfirm.value !== expectedUsername) {
    deleteError.value = "Username doesn't match.";
    return;
  }
  deleteLoading.value = true;
  deleteError.value = "";
  try {
    await $fetch("/api/me", {
      method: "DELETE",
      body: { password: deletePasswordDraft.value },
    });
    await refreshSession();
    await navigateTo("/");
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    deleteError.value = err.data?.statusMessage ?? "Could not delete account.";
  } finally {
    deleteLoading.value = false;
  }
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

type BetaApplication = {
  id: number;
  email: string;
  displayName: string | null;
  socials: string | null;
  foundVia: string | null;
  reason: string;
  createdAt: string;
};

const { data: betaApplications, refresh: refreshBetaApplications } =
  await useFetch<BetaApplication[]>("/api/admin/beta-applications", {
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

type AuditLogEntry = {
  id: number;
  action: string;
  targetType: string;
  targetId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: number; username: string; displayName: string | null } | null;
};

const auditLogOpen = ref(false);
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
        refreshBetaApplications(),
        refreshRemovalQueue(),
        refreshAnnotationReports(),
      ]);
    }
  },
  { immediate: true },
);

watch(auditLogOpen, async (v) => {
  if (v && isAdmin.value) await refreshAuditLog();
});

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
  "beta.approve": "approved beta application",
  "beta.reject": "rejected beta application",
  "restroom.publish": "published restroom",
  "restroom.reject": "rejected restroom",
  "restroom.dismiss-removal": "dismissed removal request",
  "annotation.hide": "hid annotation",
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
const approveBetaApplication = (id: number) =>
  runAction(
    `beta-approve-${id}`,
    `/api/admin/beta-applications/${id}/approve`,
    refreshBetaApplications,
  );
const rejectBetaApplication = (id: number) =>
  runAction(
    `beta-reject-${id}`,
    `/api/admin/beta-applications/${id}/reject`,
    refreshBetaApplications,
  );
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

const roleLabel = computed(() => {
  if (!user.value) return "";
  if (isAdmin.value) return "Admin";
  return "Archivist";
});
</script>

<template>
  <div class="account-page">
    <CatalogHeader />

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
          :class="{ active: authTab === 'apply' }"
          @click="switchTab('apply')"
        >
          Request access
        </button>
      </div>

      <!-- Sign in -->
      <form
        v-if="authTab === 'signin'"
        class="form"
        @submit.prevent="submitAuth"
      >
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

        <label class="field">
          <span class="field-label">Password</span>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="field-input"
          />
        </label>

        <NuxtTurnstile v-model="turnstileToken" class="turnstile" />

        <p v-if="authError" class="form-error">{{ authError }}</p>

        <button
          type="submit"
          class="primary-btn"
          :disabled="authLoading || !turnstileToken"
        >
          {{ authLoading ? "…" : !turnstileToken ? "Verifying…" : "Sign in" }}
        </button>

        <NuxtLink to="/forgot-password" class="forgot-password-link">
          Forgot your password?
        </NuxtLink>
      </form>

      <!-- Request access (beta-archivist application) -->
      <template v-else>
        <div class="signup-intro">
          <h2 class="signup-intro-title">
            Request access to be a beta-archivist!
          </h2>
          <p>
            The archive is invite-only while we build out sign-up. Tell us a
            little about yourself and we'll email you an invite if you're
            approved.
          </p>
        </div>

        <div v-if="applySubmitted" class="apply-success">
          <p>
            <strong>Application received.</strong> If you're approved, we'll
            email you a link to finish setting up your account.
          </p>
        </div>

        <form v-else class="form" @submit.prevent="submitApplication">
          <label class="field">
            <span class="field-label">Email</span>
            <input
              v-model="applyEmail"
              type="email"
              required
              autocomplete="email"
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">Name</span>
            <input
              v-model="applyDisplayName"
              type="text"
              autocomplete="name"
              required
              maxlength="25"
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">Socials (optional)</span>
            <input
              v-model="applySocials"
              type="text"
              maxlength="300"
              class="field-input"
            />
            <span class="field-hint"
              >Instagram, website, wherever we can find you.</span
            >
          </label>

          <label class="field">
            <span class="field-label"
              >How did you find the Restroom Archive?</span
            >
            <textarea
              v-model="applyFoundVia"
              required
              maxlength="500"
              rows="2"
              class="field-input field-textarea"
            />
          </label>

          <label class="field">
            <span class="field-label">Why do you want to be an archivist?</span>
            <textarea
              v-model="applyReason"
              required
              maxlength="1000"
              rows="4"
              class="field-input field-textarea"
            />
          </label>

          <div class="apply-terms">
            <p class="apply-terms-title">The Archivist Agreement</p>
            <p class="apply-terms-intro">
              The mission of the The Restroom Archive is to carefully and
              faithfully document restrooms captured as they are. As an
              archivist, I agree to abide by the submission rules:
            </p>
            <ul class="apply-terms-list">
              <li v-for="(rule, i) in SUBMISSION_AGREEMENTS" :key="i">
                {{ rule }}
              </li>
            </ul>
            <label class="apply-terms-check">
              <input v-model="applyAgree" type="checkbox" required />
              <span
                >I agree to abide by the submission rules and to uphold the
                Restroom Archive's mission.</span
              >
            </label>
          </div>

          <NuxtTurnstile v-model="applyToken" class="turnstile" />

          <p v-if="applyError" class="form-error">{{ applyError }}</p>

          <button
            type="submit"
            class="primary-btn"
            :disabled="applyLoading || !applyToken"
          >
            {{
              applyLoading
                ? "…"
                : !applyToken
                  ? "Verifying…"
                  : "Submit application"
            }}
          </button>
        </form>
      </template>
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
              <button
                type="submit"
                class="dn-btn"
                :disabled="displayNameLoading"
              >
                {{ displayNameLoading ? "…" : "Save" }}
              </button>
              <button
                type="button"
                class="dn-btn dn-cancel"
                @click="editingDisplayName = false"
              >
                Cancel
              </button>
            </form>
            <p v-if="displayNameError" class="form-error dn-error">
              {{ displayNameError }}
            </p>
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
            <button
              type="button"
              class="dn-edit-btn"
              @click="startEditDisplayName"
            >
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

      <div v-if="!changingPassword" class="change-password-collapsed">
        <button
          type="button"
          class="link-btn change-password-btn"
          @click="startChangePassword"
        >
          Change password
        </button>
        <span v-if="passwordSuccess" class="password-success"
          >Password updated.</span
        >
      </div>
      <section v-else class="section">
        <form class="form" @submit.prevent="saveNewPassword">
          <h2 class="section-title">Change password</h2>
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
          <p v-if="passwordError" class="form-error">{{ passwordError }}</p>
          <div class="change-password-actions">
            <button
              type="submit"
              class="primary-btn"
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
      </section>

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
            Admins reserve the right to deny, remove, and edit any submissions
            as they see fit, without notice. By submitting this request, you
            agree to these terms.
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

      <!-- Delete account -->
      <section v-if="!isAdmin" class="section danger-section">
        <div v-if="!deletingAccount" class="delete-collapsed">
          <button
            type="button"
            class="link-btn delete-link"
            @click="startDeleteAccount"
          >
            Delete account
          </button>
        </div>
        <form
          v-else
          class="form delete-form"
          @submit.prevent="confirmDeleteAccount"
        >
          <h2 class="section-title danger-title">Delete your account</h2>
          <p class="danger-warning">
            This will permanently remove your account, your annotations, and any
            pending submissions. Published restrooms you submitted will stay in
            the archive but will no longer show your name.
            <strong>This cannot be undone.</strong>
          </p>
          <label class="field">
            <span class="field-label">
              Type your username
              <code class="confirm-code">{{
                (user as { username?: string } | null)?.username
              }}</code>
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
          <div class="delete-actions">
            <button type="submit" class="danger-btn" :disabled="deleteLoading">
              {{ deleteLoading ? "Deleting…" : "Permanently delete account" }}
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
            Beta applications
            <span v-if="betaApplications?.length" class="count">{{
              betaApplications.length
            }}</span>
          </h2>

          <div v-if="!betaApplications?.length" class="empty">
            No applications pending.
          </div>

          <ul v-else class="simple-list">
            <li
              v-for="a in betaApplications"
              :key="a.id"
              class="simple-row beta-row"
            >
              <div class="simple-main">
                <span class="simple-title">{{ a.displayName || a.email }}</span>
                <span class="simple-meta"
                  >{{ a.email }} · applied {{ a.createdAt }}</span
                >
                <dl class="beta-answers">
                  <template v-if="a.socials">
                    <dt>Socials</dt>
                    <dd>{{ a.socials }}</dd>
                  </template>
                  <template v-if="a.foundVia">
                    <dt>Found us via</dt>
                    <dd>{{ a.foundVia }}</dd>
                  </template>
                  <dt>Why an archivist</dt>
                  <dd>{{ a.reason }}</dd>
                </dl>
              </div>
              <div class="simple-actions">
                <button
                  type="button"
                  class="btn btn-publish"
                  :disabled="actionLoading === `beta-approve-${a.id}`"
                  @click="approveBetaApplication(a.id)"
                >
                  {{
                    actionLoading === `beta-approve-${a.id}`
                      ? "…"
                      : "Approve & invite"
                  }}
                </button>
                <button
                  type="button"
                  class="btn btn-reject"
                  :disabled="actionLoading === `beta-reject-${a.id}`"
                  @click="rejectBetaApplication(a.id)"
                >
                  {{ actionLoading === `beta-reject-${a.id}` ? "…" : "Reject" }}
                </button>
              </div>
            </li>
          </ul>
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

                <!-- Row 1: Rename + Promote -->
                <div class="mod-row">
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
                      {{
                        actionLoading === `acct-${a.id}-rename` ? "…" : "Save"
                      }}
                    </button>
                    <button
                      type="button"
                      class="link-btn"
                      @click="renamingAccountId = null"
                    >
                      Cancel
                    </button>
                    <p v-if="renameError" class="form-error">
                      {{ renameError }}
                    </p>
                  </div>
                  <button
                    v-else-if="a.id !== (user as any)?.id"
                    type="button"
                    class="btn rename-btn"
                    @click="startRename(a)"
                  >
                    Rename @{{ a.username }}
                  </button>

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
                </div>

                <!-- Row 2: Timed restrictions + Permanent ban -->
                <div v-if="a.role !== 'admin'" class="mod-row mod-row-restrict">
                  <div class="restrict-group">
                    <template v-if="!isAccountMuted(a)">
                      <input
                        v-model.number="optionsMuteDays"
                        type="number"
                        min="1"
                        max="3650"
                        class="field-input mute-days"
                        placeholder="days"
                      />
                    </template>
                    <button
                      v-if="a.approvedAt"
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
                      v-else
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
                    <button
                      v-else
                      type="button"
                      class="btn"
                      :disabled="actionLoading === `acct-${a.id}-mute`"
                      @click="muteAccount(a)"
                    >
                      {{
                        actionLoading === `acct-${a.id}-mute`
                          ? "…"
                          : "Revoke All Access"
                      }}
                    </button>
                  </div>

                  <div class="ban-group">
                    <button
                      type="button"
                      class="btn btn-delete"
                      :disabled="actionLoading === `acct-${a.id}-delete`"
                      @click="deleteAccount(a)"
                    >
                      {{
                        actionLoading === `acct-${a.id}-delete`
                          ? "…"
                          : "Delete account"
                      }}
                    </button>
                    <button
                      v-if="!a.bannedAt"
                      type="button"
                      class="btn btn-reject"
                      :disabled="actionLoading === `acct-${a.id}-ban`"
                      @click="banAccount(a)"
                    >
                      {{
                        actionLoading === `acct-${a.id}-ban`
                          ? "…"
                          : "Permanently ban"
                      }}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section class="section">
          <h2 class="section-title">
            Reported annotations
            <span v-if="annotationReports?.length" class="count">{{
              annotationReports.length
            }}</span>
          </h2>

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

        <section class="section">
          <button
            type="button"
            class="section-title section-toggle"
            :aria-expanded="auditLogOpen"
            @click="auditLogOpen = !auditLogOpen"
          >
            <span class="caret">{{ auditLogOpen ? "▾" : "▸" }}</span>
            Audit log
          </button>

          <template v-if="auditLogOpen">
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
          </template>
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
  align-items: last baseline;
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
  /* font-weight: 700; */
  background: #000;
  color: #fff;
  padding: 3px 8px;
  border-radius: 3px;
}
.dn-edit-btn {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  line-height: 0.1;
  text-decoration: underline;
}
.dn-edit-btn:hover {
  color: #000;
}
.dn-inline-form {
  display: flex;
  align-items: last baseline;
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

.forgot-password-link {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  text-decoration: underline;
  align-self: flex-start;
}

.change-password-collapsed {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
.change-password-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.password-success {
  font-size: 14px;
  color: #666;
  font-style: italic;
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
.apply-success {
  background: #f4f4f4;
  padding: 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #000;
  max-width: 380px;
  border-left: 3px solid #000;
}
.apply-success p {
  margin: 0;
}
.apply-terms {
  border: 1px solid #000;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: #000;
}
.apply-terms-title {
  margin: 0 0 6px;
  font-weight: 700;
}
.apply-terms-intro {
  margin: 0 0 8px;
}
.apply-terms-list {
  margin: 0 0 12px;
  padding-left: 18px;
}
.apply-terms-list li {
  margin-bottom: 4px;
}
.apply-terms-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
}
.apply-terms-check input {
  margin: 2px 0 0;
  flex-shrink: 0;
}
.beta-row {
  align-items: flex-start;
}
.beta-answers {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #333;
}
.beta-answers dt {
  font-weight: 700;
  margin-top: 6px;
}
.beta-answers dd {
  margin: 0;
  white-space: pre-wrap;
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
  border: 1px solid #000;
  padding: 4px 2px;
  font: inherit;
  font-size: 14px;
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
  padding: 6px 10px;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}
.change-password-btn {
  padding: 0;
}
.audit-action {
  color: #000;
}
.audit-target {
  color: #888;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 13px;
  margin-left: 4px;
}
.audit-meta-summary {
  color: #666;
  word-break: break-word;
}
.delete-link {
  padding: 0;
  color: #c33;
}
.danger-section {
  margin-top: 40px;
}
.danger-title {
  color: #c33;
  border-bottom-color: #c33;
}
.danger-warning {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #000;
  background: #fbeaea;
  border-left: 3px solid #c33;
  padding: 10px 12px;
}
.confirm-code {
  font-family: ui-monospace, Menlo, monospace;
  background: #f4f4f4;
  padding: 1px 6px;
  font-size: 13px;
}
.delete-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.danger-btn {
  background: #c33;
  color: #fff;
  border: 0;
  padding: 10px 24px;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  align-self: flex-start;
}
.danger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.danger-btn:hover:not(:disabled) {
  background: #a22;
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
  border-radius: 6px;
  padding: 2px 8px;
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
  padding: 6px 10px;
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
  border-top: 1px solid #ccc;
}
.simple-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  /* background: #ccc; */
  border-bottom: 1px solid #ccc;
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
  /* border: 1px solid #000; */
  border: none;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  color: #000;
}
.icon-btn:hover:not(:disabled) {
  color: #ff0000;
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
  border-bottom: 1px solid #ccc;
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
.mod-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.mod-row-restrict {
  justify-content: space-between;
}
.restrict-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.mute-days {
  width: 70px;
  border: 1px solid #000;
  padding: 6px 6px;
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

.ban-group {
  display: flex;
  gap: 8px;
}
.btn-delete {
  border-color: #999;
  color: #666;
  font-size: 13px;
}
.btn-delete:hover:not(:disabled) {
  background: #c33;
  border-color: #c33;
  color: #fff;
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
