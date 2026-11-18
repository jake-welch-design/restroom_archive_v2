<script setup lang="ts">
/**
 * Where the Weekly Report's confirmation email lands. The subscription is made
 * from here, by script, rather than by the link itself: mail scanners open
 * links to vet them, and a link that subscribed on load would let them confirm
 * on the reader's behalf.
 */
import { apiErrorMessage } from "~~/shared/utils/apiError";
import { markWeeklyReportPrompt } from "~/composables/useWeeklyReportPrompt";

useHead({
  title: "Weekly Report",
  meta: [{ name: "robots", content: "noindex" }],
});

const route = useRoute();
const state = ref<"working" | "done" | "failed">("working");
const error = ref("");

onMounted(async () => {
  const { email, ts, sig } = route.query;
  if (
    typeof email !== "string" ||
    typeof ts !== "string" ||
    typeof sig !== "string"
  ) {
    state.value = "failed";
    error.value = "This confirmation link is incomplete.";
    return;
  }
  try {
    await $fetch("/api/newsletter/confirm", {
      method: "POST",
      body: { email, ts, sig },
    });
    markWeeklyReportPrompt("subscribed");
    state.value = "done";
  } catch (e) {
    state.value = "failed";
    error.value = apiErrorMessage(e, "Something went wrong. Please try again.");
  }
});
</script>

<template>
  <div class="confirm-page">
    <CatalogHeader />
    <article class="confirm-content">
      <WeeklyReportMasthead />
      <div class="confirm-rule" aria-hidden="true" />
      <h1 v-if="state === 'working'" role="status">Confirming…</h1>
      <template v-else-if="state === 'done'">
        <h1 role="status">You're subscribed</h1>
        <p>The next Weekly Report will be in your inbox.</p>
        <NuxtLink to="/" class="confirm-btn">Back to the Archive</NuxtLink>
      </template>
      <template v-else>
        <h1>That didn't work</h1>
        <p class="form-error" role="alert">{{ error }}</p>
        <NuxtLink to="/about" class="confirm-btn">Sign up again</NuxtLink>
      </template>
    </article>
  </div>
</template>

<style scoped>
.confirm-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  color: #000;
}

/* The email's column: 600px wide at most, 32px gutters, a rule under the
   masthead, a title at 140%, body at 150%, and its black button. */
.confirm-content {
  width: 100%;
  max-width: 600px;
  box-sizing: border-box;
  padding: 32px;
  font-size: 14px;
  line-height: 1.5;
}

.confirm-rule {
  height: 1px;
  margin: 32px 0;
  background: #000;
}

.confirm-content h1 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.4;
}

.confirm-content p {
  margin: 0 0 16px;
}

.confirm-btn {
  display: inline-block;
  margin-top: 0;
  padding: 16px 20px;
  border-radius: 3px;
  background: #000;
  color: #fff;
  line-height: 1;
  text-decoration: none;
}
</style>
