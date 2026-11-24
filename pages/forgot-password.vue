<script setup lang="ts">
/**
 * Requests a password reset link.
 *
 * The response is deliberately identical whether or not an account exists for
 * the address, so the page cannot be used to enumerate registered emails. The
 * confirmation below is worded to match.
 */
const { token: turnstileToken, waitForToken, resetToken } = useTurnstileToken();
const { resolved: resolvedTheme } = useTheme();
const action = useAsyncAction("Something went wrong.");

const email = ref("");
const submitted = ref(false);

async function submit() {
  if (!(await waitForToken())) {
    action.error = "Still verifying. Please wait a moment and try again.";
    return;
  }

  const ok = await action.run(() =>
    $fetch("/api/auth/forgot-password", {
      method: "POST",
      body: { email: email.value, turnstileToken: turnstileToken.value },
    }),
  );
  if (ok) {
    submitted.value = true;
  } else {
    // A Turnstile token is single use, so a retry needs a fresh one.
    resetToken();
  }
}
</script>

<template>
  <AuthPageShell title="Forgot your password?">
    <div v-if="submitted" class="auth-msg">
      <p>If an account exists for that email, we've sent a reset link.</p>
      <p class="dim">Check your inbox. The link expires in 1 hour.</p>
      <NuxtLink to="/account" class="link-btn">Back to sign in</NuxtLink>
    </div>

    <form v-else class="form" @submit.prevent="submit">
      <p class="auth-intro">
        Enter the email you signed up with. We'll send a link to reset your
        password.
      </p>

      <label class="field">
        <span class="field-label">Email</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="field-input"
        />
      </label>

      <NuxtTurnstile
        v-model="turnstileToken"
        class="turnstile"
        :options="{ theme: resolvedTheme, appearance: 'interaction-only' }"
      />

      <p v-if="action.error" class="form-error">{{ action.error }}</p>

      <button
        type="submit"
        class="primary-btn"
        :disabled="action.loading || !turnstileToken"
      >
        {{
          action.loading
            ? "Sending…"
            : !turnstileToken
              ? "Verifying…"
              : "Send reset link"
        }}
      </button>

      <NuxtLink to="/account" class="link-btn">Back to sign in</NuxtLink>
    </form>
  </AuthPageShell>
</template>
