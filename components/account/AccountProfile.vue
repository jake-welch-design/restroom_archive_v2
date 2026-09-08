<script setup lang="ts">
/**
 * The Profile tab: the four things a user can change about their own account.
 *
 * Every row follows one idiom, which is what makes the tab readable as a list
 * rather than as four forms: a label, the current value, and an action on the
 * right that swaps the row in place for an inline edit form. Nothing navigates
 * away, and only one row is ever open at a time from the user's point of view
 * because opening one is an explicit act.
 *
 * The username is deliberately absent. It is fixed at sign-up and only an admin
 * can change it, because it appears on every annotation the account has left.
 */
const { user, isAdmin, refreshSession } = useAuth();

const username = computed(() => user.value?.username ?? "");

/* --- Display name ------------------------------------------------------- */

const editingName = ref(false);
const nameDraft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);
const nameAction = useAsyncAction("Could not save display name.");

function startEditName() {
  nameDraft.value = user.value?.displayName ?? "";
  nameAction.reset();
  editingName.value = true;
  // Focus after the input exists: it is behind the v-if above.
  nextTick(() => nameInput.value?.focus());
}

async function saveName() {
  const ok = await nameAction.run(async () => {
    await $fetch("/api/me", {
      method: "PATCH",
      body: { displayName: nameDraft.value },
    });
    await refreshSession();
  });
  if (ok) editingName.value = false;
}

/* --- Email --------------------------------------------------------------- */

const changingEmail = ref(false);
const emailDraft = ref("");
const emailPassword = ref("");
const emailSaved = ref(false);
const emailAction = useAsyncAction("Could not update email.");

function startChangeEmail() {
  changingEmail.value = true;
  emailDraft.value = user.value?.email ?? "";
  emailPassword.value = "";
  emailSaved.value = false;
  emailAction.reset();
}

function cancelChangeEmail() {
  changingEmail.value = false;
  emailDraft.value = "";
  emailPassword.value = "";
  emailAction.reset();
}

async function saveEmail() {
  const ok = await emailAction.run(async () => {
    await $fetch("/api/me/email", {
      method: "PATCH",
      body: { email: emailDraft.value, currentPassword: emailPassword.value },
    });
    await refreshSession();
  });
  if (!ok) return;
  changingEmail.value = false;
  emailPassword.value = "";
  emailSaved.value = true;
}

/* --- Password ------------------------------------------------------------ */

const changingPassword = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const passwordSaved = ref(false);
const passwordAction = useAsyncAction("Could not update password.");

function clearPasswordDrafts() {
  currentPassword.value = "";
  newPassword.value = "";
  confirmPassword.value = "";
}

function startChangePassword() {
  changingPassword.value = true;
  clearPasswordDrafts();
  passwordSaved.value = false;
  passwordAction.reset();
}

function cancelChangePassword() {
  changingPassword.value = false;
  clearPasswordDrafts();
  passwordAction.reset();
}

async function savePassword() {
  // Both rules are enforced server side as well. Checking here spares a round
  // trip on the two mistakes people actually make.
  if (newPassword.value.length < 8) {
    passwordAction.fail("Password must be at least 8 characters.");
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordAction.fail("Passwords do not match.");
    return;
  }

  const ok = await passwordAction.run(() =>
    $fetch("/api/me/password", {
      method: "PATCH",
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    }),
  );
  if (!ok) return;
  changingPassword.value = false;
  clearPasswordDrafts();
  passwordSaved.value = true;
}

/* --- Admin notifications -------------------------------------------------- */

/**
 * Admin-only, and opt-in per account: promoting someone to admin subscribes
 * them to nothing. The server checks the same thing on every send, so this row
 * is the control, not the enforcement.
 *
 * Delivery is ntfy: the admin picks a topic name, subscribes to it in the ntfy
 * app, and puts the same name here. Fetched through `$fetch` in a watcher
 * rather than `useFetch`, because the route 403s for non-admins and the
 * component mounts for everyone -- there is nothing to request until the
 * session resolves and says otherwise.
 */
interface NotifySettings {
  enabled: boolean;
  hasTopic: boolean;
  topicHint: string | null;
  /**
   * Whether the server holds an ntfy token. False means every send goes out
   * anonymous and is metered against a shared IP, which delivers for a few
   * hours after the quota resets at UTC midnight and then silently stops --
   * so this is surfaced rather than left to be discovered through missing
   * notifications.
   */
  serverAuthenticated: boolean;
}

const notify = ref<NotifySettings | null>(null);
const editingNotify = ref(false);
const notifyEnabledDraft = ref(false);
const notifyTopicDraft = ref("");
const notifyTested = ref("");
// Separate from `notifyTested` because the two coexist: the send succeeded and
// is worth confirming, while the warning explains why that success is fragile.
const notifyTestWarning = ref("");
const notifyAction = useAsyncAction("Could not save notification settings.");
const notifyTestAction = useAsyncAction("Could not send a test notification.");

watch(
  isAdmin,
  async (admin) => {
    if (!admin) return;
    try {
      notify.value = await $fetch<NotifySettings>("/api/me/notifications");
    } catch {
      // A settings row that cannot load its own state is not worth an error
      // banner on the Profile tab; it simply stays closed.
    }
  },
  { immediate: true },
);

const notifyStatus = computed(() => {
  if (!notify.value) return "";
  if (notify.value.enabled) return `On · ${notify.value.topicHint}`;
  return notify.value.hasTopic ? "Off" : "Not set up";
});

function startEditNotify() {
  notifyEnabledDraft.value = notify.value?.enabled ?? false;
  // Never seeded with the stored topic: the server returns it masked, because
  // knowing a topic is all it takes to publish to one.
  notifyTopicDraft.value = "";
  notifyTested.value = "";
  notifyTestWarning.value = "";
  notifyAction.reset();
  notifyTestAction.reset();
  editingNotify.value = true;
}

async function saveNotify() {
  const typed = notifyTopicDraft.value.trim();
  if (notifyEnabledDraft.value && !typed && !notify.value?.hasTopic) {
    notifyAction.fail("Enter an ntfy topic first.");
    return;
  }

  const ok = await notifyAction.run(async () => {
    await $fetch("/api/me/notifications", {
      method: "PATCH",
      // Omitted when blank, which keeps the stored topic rather than clearing
      // it — the field is empty on open, so blank means "unchanged".
      body: {
        enabled: notifyEnabledDraft.value,
        ...(typed ? { topic: typed } : {}),
      },
    });
    notify.value = await $fetch<NotifySettings>("/api/me/notifications");
  });
  if (ok) editingNotify.value = false;
}

async function clearNotifyTopic() {
  const ok = await notifyAction.run(async () => {
    await $fetch("/api/me/notifications", {
      method: "PATCH",
      body: { enabled: false, topic: "" },
    });
    notify.value = await $fetch<NotifySettings>("/api/me/notifications");
  });
  if (ok) {
    notifyEnabledDraft.value = false;
    notifyTopicDraft.value = "";
    notifyTested.value = "";
  }
}

/**
 * A mistyped topic fails exactly like a working one: nothing arrives. So the
 * form can send a real notification through the stored topic and say whether
 * ntfy took it.
 */
async function sendTestNotify() {
  notifyTested.value = "";
  notifyTestWarning.value = "";
  let warning = "";
  const ok = await notifyTestAction.run(async () => {
    const res = await $fetch<{
      authenticated: boolean;
      warning: string | null;
    }>("/api/me/notifications/test", { method: "POST" });
    warning = res.warning ?? "";
  });
  if (!ok) return;
  notifyTested.value = "Sent — check your phone.";
  // An unauthenticated send still arrives, so it is not an error -- but saying
  // only "Sent." is what let a fundamentally broken setup pass a green test.
  notifyTestWarning.value = warning;
}

/* --- Delete account ------------------------------------------------------ */

const deleting = ref(false);
const deletePassword = ref("");
const deleteUsernameConfirm = ref("");
const deleteAction = useAsyncAction("Could not delete account.");

function startDelete() {
  deleting.value = true;
  deletePassword.value = "";
  deleteUsernameConfirm.value = "";
  deleteAction.reset();
}

function cancelDelete() {
  deleting.value = false;
  deletePassword.value = "";
  deleteUsernameConfirm.value = "";
  deleteAction.reset();
}

async function confirmDelete() {
  if (!username.value) return;
  if (deleteUsernameConfirm.value !== username.value) {
    deleteAction.fail("Username doesn't match.");
    return;
  }

  const ok = await deleteAction.run(() =>
    $fetch("/api/me/delete", {
      method: "POST",
      body: { password: deletePassword.value },
    }),
  );
  if (!ok) return;

  // Past this point the account is gone and the server has already cleared the
  // session, so a failure here is a navigation problem rather than a failed
  // delete. Keeping it inside the guarded call above reported a successful
  // deletion as "Could not delete account."
  await refreshSession();
  await navigateTo("/");
}
</script>

<template>
  <div class="settings-list form-column">
    <div class="settings-row">
      <span class="settings-label">Name</span>

      <template v-if="!editingName">
        <span class="settings-value">
          <template v-if="user?.displayName">{{ user.displayName }}</template>
          <span v-else class="dim">Not set</span>
        </span>
        <button
          type="button"
          class="btn settings-change"
          @click="startEditName"
        >
          Change
        </button>
      </template>

      <form v-else class="settings-edit" @submit.prevent="saveName">
        <label class="field">
          <span class="field-label">Display name</span>
          <input
            ref="nameInput"
            v-model="nameDraft"
            type="text"
            maxlength="25"
            class="field-input"
            placeholder="Blank to clear"
            @keydown.esc="editingName = false"
          />
          <span class="field-hint">Shown instead of @{{ username }}.</span>
        </label>
        <p v-if="nameAction.error" class="form-error">
          {{ nameAction.error }}
        </p>
        <div class="settings-edit-actions">
          <button
            type="submit"
            class="primary-btn btn-sm"
            :disabled="nameAction.loading"
          >
            {{ nameAction.loading ? "…" : "Save" }}
          </button>
          <button type="button" class="link-btn" @click="editingName = false">
            Cancel
          </button>
        </div>
      </form>
    </div>

    <div class="settings-row">
      <span class="settings-label">Email</span>

      <template v-if="!changingEmail">
        <span class="settings-value">{{ user?.email }}</span>
        <span v-if="emailSaved" class="settings-saved">Updated.</span>
        <button
          type="button"
          class="btn settings-change"
          @click="startChangeEmail"
        >
          Change
        </button>
      </template>

      <form v-else class="settings-edit" @submit.prevent="saveEmail">
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
            v-model="emailPassword"
            type="password"
            required
            autocomplete="current-password"
            class="field-input"
          />
          <span class="field-hint">
            Confirm it's you before changing your email.
          </span>
        </label>
        <p v-if="emailAction.error" class="form-error">
          {{ emailAction.error }}
        </p>
        <div class="settings-edit-actions">
          <button
            type="submit"
            class="primary-btn btn-sm"
            :disabled="emailAction.loading"
          >
            {{ emailAction.loading ? "Saving…" : "Update email" }}
          </button>
          <button
            type="button"
            class="link-btn"
            :disabled="emailAction.loading"
            @click="cancelChangeEmail"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <div class="settings-row">
      <span class="settings-label">Password</span>

      <template v-if="!changingPassword">
        <span class="settings-value settings-dots">••••••••••</span>
        <span v-if="passwordSaved" class="settings-saved">Updated.</span>
        <button
          type="button"
          class="btn settings-change"
          @click="startChangePassword"
        >
          Change
        </button>
      </template>

      <form v-else class="settings-edit" @submit.prevent="savePassword">
        <label class="field">
          <span class="field-label">Current password</span>
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
            class="field-input"
          />
        </label>
        <label class="field">
          <span class="field-label">New password</span>
          <input
            v-model="newPassword"
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
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            class="field-input"
          />
        </label>
        <p v-if="passwordAction.error" class="form-error">
          {{ passwordAction.error }}
        </p>
        <div class="settings-edit-actions">
          <button
            type="submit"
            class="primary-btn btn-sm"
            :disabled="passwordAction.loading"
          >
            {{ passwordAction.loading ? "Saving…" : "Update password" }}
          </button>
          <button
            type="button"
            class="link-btn"
            :disabled="passwordAction.loading"
            @click="cancelChangePassword"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Admin-only, and off until the box below is checked. Nobody is enrolled
         by being promoted. -->
    <div v-if="isAdmin" class="settings-row">
      <span class="settings-label">Alerts</span>

      <template v-if="!editingNotify">
        <span class="settings-value">
          <template v-if="notify">{{ notifyStatus }}</template>
          <span v-else class="dim">…</span>
        </span>
        <button
          type="button"
          class="btn settings-change"
          @click="startEditNotify"
        >
          Change
        </button>
      </template>

      <form v-else class="settings-edit" @submit.prevent="saveNotify">
        <label class="notify-check">
          <input v-model="notifyEnabledDraft" type="checkbox" />
          <span>Receive Admin Notifications</span>
        </label>
        <p class="notify-hint">
          A push notification when a new submission reaches the pending queue.
          Delivered through
          <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a>:
          install the app, subscribe to a topic name only you know, then enter
          the same name here.
        </p>

        <!-- A server with no ntfy token still delivers for a few hours after
             the shared IP's quota resets at UTC midnight, then stops for the
             rest of the day. Stated up front rather than left to be inferred
             from notifications that never arrive. -->
        <p v-if="notify && !notify.serverAuthenticated" class="notify-warning">
          The server has no ntfy token, so notifications will arrive
          unpredictably — set <code>NUXT_NTFY_TOKEN</code> and redeploy.
        </p>

        <label class="field">
          <span class="field-label">ntfy topic</span>
          <input
            v-model="notifyTopicDraft"
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="64"
            class="field-input"
            :placeholder="
              notify?.hasTopic
                ? 'Leave blank to keep current'
                : 'my-secret-topic'
            "
          />
          <span class="field-hint">
            Letters, numbers, dashes and underscores. Anyone who knows the topic
            can send to it, so pick something unguessable.
          </span>
        </label>

        <p v-if="notifyAction.error" class="form-error">
          {{ notifyAction.error }}
        </p>
        <p v-if="notifyTestAction.error" class="form-error">
          {{ notifyTestAction.error }}
        </p>
        <p v-if="notifyTested" class="settings-saved">{{ notifyTested }}</p>
        <p v-if="notifyTestWarning" class="notify-warning">
          {{ notifyTestWarning }}
        </p>

        <div class="settings-edit-actions">
          <button
            type="submit"
            class="primary-btn btn-sm"
            :disabled="notifyAction.loading"
          >
            {{ notifyAction.loading ? "Saving…" : "Save" }}
          </button>
          <button
            v-if="notify?.hasTopic"
            type="button"
            class="link-btn"
            :disabled="notifyTestAction.loading"
            @click="sendTestNotify"
          >
            {{ notifyTestAction.loading ? "Sending…" : "Send test" }}
          </button>
          <button
            v-if="notify?.hasTopic"
            type="button"
            class="link-btn"
            :disabled="notifyAction.loading"
            @click="clearNotifyTopic"
          >
            Clear topic
          </button>
          <button
            type="button"
            class="link-btn"
            :disabled="notifyAction.loading"
            @click="editingNotify = false"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Self-service and immediate: no admin approval step sits behind this,
         so the label must not imply one. Hidden from admins, whose accounts
         the API refuses to delete through this route anyway. -->
    <div v-if="!isAdmin" class="settings-row settings-row-danger">
      <span class="settings-label">Delete</span>

      <template v-if="!deleting">
        <span class="settings-value dim">Permanently remove your account</span>
        <button
          type="button"
          class="btn btn-danger-outline settings-change"
          @click="startDelete"
        >
          Delete account
        </button>
      </template>

      <form v-else class="settings-edit" @submit.prevent="confirmDelete">
        <p class="danger-warning">
          This will permanently remove your account, your annotations, and any
          pending submissions. Published restrooms you submitted will stay in
          the archive but will no longer show your name.
          <strong>This cannot be undone.</strong>
        </p>
        <label class="field">
          <span class="field-label">
            Type your username
            <code class="confirm-code">{{ username }}</code>
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
            v-model="deletePassword"
            type="password"
            autocomplete="current-password"
            required
            class="field-input"
          />
        </label>
        <p v-if="deleteAction.error" class="form-error">
          {{ deleteAction.error }}
        </p>
        <div class="settings-edit-actions">
          <button
            type="submit"
            class="danger-btn btn-sm"
            :disabled="deleteAction.loading"
          >
            {{
              deleteAction.loading ? "Deleting…" : "Permanently delete account"
            }}
          </button>
          <button
            type="button"
            class="link-btn"
            :disabled="deleteAction.loading"
            @click="cancelDelete"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.settings-saved {
  font-size: 11px;
  color: #666;
}

.notify-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #000;
  cursor: pointer;
}

.notify-check input {
  margin: 0;
}

.notify-hint {
  margin: 0 0 4px;
  font-size: 11px;
  line-height: 1.5;
  color: #666;
}

.notify-hint a {
  color: #000;
}

/* Not `.form-error`: the send did succeed, so this must not read as a failed
   action. It is a caution about a success that will not hold. */
.notify-warning {
  margin: 0 0 4px;
  font-size: 11px;
  line-height: 1.5;
  color: #a60;
}

.notify-warning code {
  font-family: inherit;
  background: #f0f0f0;
  padding: 0 3px;
}

.danger-warning {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #c33;
}

.confirm-code {
  font-family: inherit;
  color: #000;
  background: #f0f0f0;
  padding: 0 4px;
}
</style>
