<script setup lang="ts">
import { apiErrorMessage } from "~~/shared/utils/apiError";

/**
 * Sets a new password from a emailed reset link.
 *
 * The token arrives in the query string. It is validated server side; the
 * check here only distinguishes "this link is malformed" from "this link may
 * be expired or spent", which the server answers.
 */
const route = useRoute();
const token = computed(() => (route.query.token as string | undefined) ?? "");

const newPassword = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const error = ref("");
const success = ref(false);

async function submit() {
  if (!token.value) {
    error.value = "No reset token found in this link.";
    return;
  }
  // Mirrors the server's rule so the common mistakes are caught without a
  // round trip. The server still enforces both.
  if (newPassword.value.length < 8) {
    error.value = "Password must be at least 8 characters.";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = "Passwords do not match.";
    return;
  }

  error.value = "";
  loading.value = true;
  try {
    await $fetch("/api/auth/reset-password", {
      method: "POST",
      body: { token: token.value, password: newPassword.value },
    });
    success.value = true;
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, "Could not reset password.");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthPageShell title="Reset your password">
    <div v-if="!token" class="auth-msg">
      <p class="form-error">No reset token found in this link.</p>
      <NuxtLink to="/forgot-password" class="link-btn">
        Request a new link
      </NuxtLink>
    </div>

    <div v-else-if="success" class="auth-msg">
      <p>Your password has been reset.</p>
      <p class="dim">You can now sign in with your new password.</p>
      <NuxtLink to="/account" class="link-btn">Go to sign in</NuxtLink>
    </div>

    <form v-else class="form" @submit.prevent="submit">
      <p class="auth-intro">Choose a new password.</p>

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

      <p v-if="error" class="form-error">{{ error }}</p>

      <button type="submit" class="primary-btn" :disabled="loading">
        {{ loading ? "Saving…" : "Reset password" }}
      </button>
    </form>
  </AuthPageShell>
</template>
