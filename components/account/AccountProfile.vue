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
