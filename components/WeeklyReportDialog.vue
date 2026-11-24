<script setup lang="ts">
/**
 * The Weekly Report pop-up, shown once: on a visitor's first page load.
 * Closing it, or signing up, is remembered in this browser and it never comes
 * back (composables/useWeeklyReportPrompt.ts). The About page keeps a signup
 * of its own for anyone who closed it and changed their mind.
 *
 * Native <dialog>, as in LegalDialog: showModal() brings the focus trap, the
 * Escape key and the backdrop with it.
 */
import {
  markWeeklyReportPrompt,
  weeklyReportPromptHandled,
} from "~/composables/useWeeklyReportPrompt";
import { WEEKLY_REPORT_LINK_PARAM } from "~~/shared/utils/weeklyReport";

/**
 * Pages it never opens over: the admin tools, and the pages someone lands on
 * from an email link, who is mid-task (or already subscribing).
 */
const SKIP = [
  /^\/studio/,
  /^\/newsletter/,
  /^\/weekly-report/,
  /^\/reset-password/,
  /^\/forgot-password/,
];

const route = useRoute();
const dialog = ref<HTMLDialogElement | null>(null);
const subscribed = ref(false);

onMounted(() => {
  if (SKIP.some((re) => re.test(route.path))) return;
  // Followed a link in the Weekly Report, so already a subscriber: remember
  // that here too, so this browser never asks.
  if (
    route.query[WEEKLY_REPORT_LINK_PARAM.name] ===
    WEEKLY_REPORT_LINK_PARAM.value
  ) {
    markWeeklyReportPrompt("subscribed");
    return;
  }
  if (weeklyReportPromptHandled()) return;
  dialog.value?.showModal();
});

function close() {
  if (dialog.value?.open) dialog.value.close();
}

/** Covers the × button, Escape, and a click on the backdrop alike. */
function onClose() {
  if (!subscribed.value) markWeeklyReportPrompt("dismissed");
}

function onClick(e: MouseEvent) {
  if (e.target === dialog.value) close();
}
</script>

<template>
  <dialog
    ref="dialog"
    class="wr-dialog"
    aria-label="Subscribe to the Weekly Report"
    @close="onClose"
    @click="onClick"
  >
    <div class="wr-head">
      <WeeklyReportMasthead />
      <button type="button" class="wr-close" aria-label="Close" @click="close">
        ×
      </button>
    </div>
    <div class="wr-rule" aria-hidden="true" />
    <div class="wr-body">
      <p>
        Sign up to receive a weekly summary with updates, features, and
        highlights from The Restroom Archive. Unsubscribe at any time.
      </p>
      <WeeklyReportSignup
        id-prefix="wr-dialog"
        @subscribed="subscribed = true"
      />
    </div>
  </dialog>
</template>

<style scoped>
/* Top-layer, outside every page's tokens: what it needs is restated here.
   Laid out as the email is: masthead, a 1px black rule inset by the gutter,
   then the body, all on 24px (the email's 32px, scaled to a dialog). */
.wr-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  --field-input-padding: 6px 8px;
  --primary-btn-padding: 8px 18px;
}

.wr-dialog::backdrop {
  background: rgb(0 0 0 / 0.35);
}

.wr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.wr-close {
  border: none;
  background: none;
  padding: 0 4px;
  margin: -4px -4px 0 0;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--ink);
}

.wr-rule {
  height: 1px;
  margin: 0 24px;
  background: var(--ink);
}

.wr-body {
  padding: 24px;
}

.wr-body > p {
  margin: 0 0 16px;
}
</style>
