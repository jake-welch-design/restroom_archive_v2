<script setup lang="ts">
import { apiErrorMessage } from "~~/shared/utils/apiError";

/**
 * The logged-out half of the account page: sign in, or create an account.
 *
 * One form serves both, because they share every field the other needs plus a
 * few. New accounts start as annotators, which lets them comment but not
 * submit; submission access is requested afterwards from the account page and
 * granted by an admin.
 *
 * The tabs row is exposed to the parent because it is the page's first bordered
 * row, which is what has to grow to meet the layout's expand tab. See
 * useAlignToStrip for why that measurement exists.
 */
const { refreshSession } = useAuth();
const { token: turnstileToken, waitForToken, resetToken } = useTurnstileToken();

type AuthTab = "signin" | "signup";
const tab = ref<AuthTab>("signin");

const tabsEl = ref<HTMLElement | null>(null);
defineExpose({ tabsEl });

const email = ref("");
const password = ref("");
const username = ref("");
const displayName = ref("");
const error = ref("");
const loading = ref(false);

const isSignup = computed(() => tab.value === "signup");

function switchTab(next: AuthTab) {
  tab.value = next;
  error.value = "";
  // The sign-up-only fields are dropped on the way back, so a half-filled
  // sign-up is not silently submitted with a later sign-in.
  if (next === "signin") {
    username.value = "";
    displayName.value = "";
  }
}

const submitLabel = computed(() => {
  if (loading.value) return "…";
  if (!turnstileToken.value) return "Verifying…";
  return isSignup.value ? "Create account" : "Sign in";
});

async function submit() {
  if (!(await waitForToken())) {
    error.value = "Still verifying. Please wait a moment and try again.";
    return;
  }

  error.value = "";
  loading.value = true;
  try {
    const body: Record<string, unknown> = {
      email: email.value,
      password: password.value,
      turnstileToken: turnstileToken.value,
    };
    if (isSignup.value) {
      body.username = username.value;
      if (displayName.value) body.displayName = displayName.value;
    }

    await $fetch(isSignup.value ? "/api/auth/signup" : "/api/auth/signin", {
      method: "POST",
      body,
    });
    // The session cookie is set by the response; refreshing is what tells the
    // rest of the app the user exists, which swaps this form for the account.
    await refreshSession();
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, "Something went wrong.");
    // A Turnstile token is single use, so a retry needs a fresh one.
    resetToken();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="body-section thin-scroll">
    <div ref="tabsEl" class="auth-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: !isSignup }"
        @click="switchTab('signin')"
      >
        Sign in
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: isSignup }"
        @click="switchTab('signup')"
      >
        Create account
      </button>
    </div>

    <div v-if="isSignup" class="signup-intro">
      <h2 class="signup-intro-title">Become an archivist</h2>
      <p>Leave annotations and submit restrooms to be part of the archive.</p>
    </div>

    <form class="form" @submit.prevent="submit">
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

      <label v-if="isSignup" class="field">
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
        <span class="field-hint">
          3–20 lowercase letters, numbers, or underscores. Cannot be changed.
        </span>
      </label>

      <label v-if="isSignup" class="field">
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
          :autocomplete="isSignup ? 'new-password' : 'current-password'"
          class="field-input"
        />
      </label>
      <p v-if="isSignup" class="field-hint">Minimum 8 characters.</p>

      <NuxtTurnstile
        v-model="turnstileToken"
        class="turnstile"
        :options="{ theme: 'light', appearance: 'interaction-only' }"
      />

      <p v-if="error" class="form-error">{{ error }}</p>

      <button
        type="submit"
        class="primary-btn"
        :disabled="loading || !turnstileToken"
      >
        {{ submitLabel }}
      </button>

      <NuxtLink
        v-if="!isSignup"
        to="/forgot-password"
        class="forgot-password-link"
      >
        Forgot your password?
      </NuxtLink>
    </form>
  </div>
</template>

<style scoped>
.body-section {
  --gutter: 20px;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--gutter);
}

/* Underlined, sentence case, weight 400, like the catalog's nav.
   Full-bleed: pulls out to the panel edges and puts the gutter back as padding,
   so the bottom rule spans the panel while the labels stay on the same left
   edge as the form below. `min-height` because this is the row that grows to
   meet the layout's expand tab; the buttons stretch with it, which keeps the
   active underline sitting on the rule. */
.auth-tabs {
  display: flex;
  margin-inline: calc(-1 * var(--gutter));
  padding-inline: var(--gutter);
  /* Closes the gutter above so the row starts flush under the site header's
     border, the way the catalog's controls strip does. */
  margin-top: calc(-1 * var(--gutter));
  margin-bottom: 16px;
  border-bottom: 1px solid #000;
  overflow-x: auto;
  box-sizing: border-box;
  min-height: var(--strip-align-height, 0px);
}

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

.form {
  max-width: 340px;
}

/* An anchor, not a button, so it takes none of the shared .link-btn reset and
   states the ink colour itself rather than inheriting the user agent's blue. */
.forgot-password-link {
  align-self: flex-start;
  font-size: 12px;
  color: #000;
  text-decoration: underline;
}

@container panel (max-width: 560px) {
  .body-section {
    --gutter: 12px;
  }
}

/* On a sheet layout the expand tab moves to the panel's bottom edge, so there
   is nothing for this row to align to. It keeps its natural height and the
   normal gutter above it. */
@media (max-width: 750px) {
  .auth-tabs {
    min-height: 0;
    margin-top: 0;
  }
}
</style>
