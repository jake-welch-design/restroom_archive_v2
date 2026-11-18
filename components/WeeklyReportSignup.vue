<script setup lang="ts">
/**
 * The Weekly Report signup: an email field and a button. Shared by the first-
 * visit pop-up and the About page, so the two can't drift apart.
 *
 * A signup only sends a confirmation email (see server/api/newsletter); the
 * success message says so, since nothing arrives until that link is clicked.
 */
import { apiErrorMessage } from "~~/shared/utils/apiError";
import { useTurnstileToken } from "~/composables/useTurnstileToken";
import { markWeeklyReportPrompt } from "~/composables/useWeeklyReportPrompt";

const props = defineProps<{
  idPrefix: string;
  /**
   * Hides the "Email" label from sight (the About page, where the blurb above
   * already says what the field is for). Screen readers still announce it: a
   * placeholder alone isn't a label.
   */
  hideLabel?: boolean;
}>();
const emit = defineEmits<{ subscribed: [] }>();

const email = ref("");
const loading = ref(false);
const error = ref("");
const sentTo = ref<string | null>(null);
const { token, resetToken, waitForToken } = useTurnstileToken();

async function submit() {
  if (!(await waitForToken())) {
    error.value = "Still verifying. Please wait a moment and try again.";
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    await $fetch("/api/newsletter/subscribe", {
      method: "POST",
      body: { email: email.value, turnstileToken: token.value },
    });
    sentTo.value = email.value.trim();
    markWeeklyReportPrompt("subscribed");
    emit("subscribed");
  } catch (e) {
    error.value = apiErrorMessage(e, "Something went wrong. Please try again.");
    resetToken();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="wr-signup">
    <p v-if="sentTo" class="wr-sent" role="status">
      Please check {{ sentTo }} for a link to confirm your subscription.
    </p>

    <form v-else class="wr-form" @submit.prevent="submit">
      <!-- The label names the field alone; wrapping the row as well made a
           screen reader announce it as "Email Subscribe". -->
      <div class="field wr-field">
        <label
          class="field-label"
          :class="{ 'sr-only': props.hideLabel }"
          :for="`${props.idPrefix}-email`"
          >Email</label
        >
        <span class="wr-row">
          <input
            :id="`${props.idPrefix}-email`"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="you@example.com"
            class="field-input wr-input"
          />
          <button
            type="submit"
            class="primary-btn wr-btn"
            :disabled="loading || !token"
          >
            {{ loading ? "Sending…" : !token ? "Verifying…" : "Subscribe" }}
          </button>
        </span>
      </div>

      <NuxtTurnstile
        v-model="token"
        class="turnstile wr-turnstile"
        :options="{ theme: 'light', appearance: 'interaction-only' }"
      />

      <p v-if="error" class="form-error">{{ error }}</p>
    </form>
  </div>
</template>

<style scoped>
.wr-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Field and button on one line, the button standing as tall as the field. */
.wr-row {
  display: flex;
  gap: 8px;
}

.wr-input {
  flex: 1 1 auto;
  min-width: 0;
}

.wr-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* The interaction-only widget is usually invisible but still a flex item. */
.wr-turnstile {
  margin: -8px 0 0;
}

.wr-sent {
  margin: 0;
}

.form-error {
  margin: 0;
}
</style>
