<script setup lang="ts">
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
    const err = e as { data?: { statusMessage?: string }; message?: string };
    error.value =
      err.data?.statusMessage ?? err.message ?? "Could not reset password.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <CatalogHeader />
    <div class="auth-content thin-scroll">
      <h1 class="auth-title">Reset your password</h1>

      <div v-if="!token" class="auth-msg">
        <p class="form-error">No reset token found in this link.</p>
        <NuxtLink to="/forgot-password" class="link-btn"
          >Request a new link</NuxtLink
        >
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
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  color: #000;
  overflow: hidden;
}
.auth-content {
  padding: 24px;
  overflow-y: auto;
  flex: 1 1 auto;
}
.auth-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 400;
  border-bottom: 1px solid #000;
  padding-bottom: 4px;
}
.auth-intro {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
.auth-msg p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
}
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
.field-input {
  border: 1px solid #000;
  padding: 4px 2px;
  font: inherit;
  font-size: 14px;
  background: transparent;
  outline: none;
  color: #000;
}
.field-hint {
  margin: 0;
  font-size: 12px;
  color: #999;
}
.form-error {
  margin: 0;
  font-size: 14px;
  color: #c33;
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
.link-btn {
  background: transparent;
  border: 0;
  padding: 6px 10px 6px 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}
.dim {
  color: #999;
}

/* Same panel-width step as the catalog and its header — the page scales with
   the panel it sits in, not with the window. */
@container panel (max-width: 560px) {
  .auth-page {
    font-size: 12px;
  }
  .auth-content {
    padding: 12px;
  }
  .auth-title {
    font-size: 14px;
  }
  .field-input {
    font-size: 12px;
  }
  .primary-btn {
    font-size: 14px;
    padding: 8px 18px;
  }
}
</style>
