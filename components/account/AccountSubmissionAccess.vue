<script setup lang="ts">
/**
 * The path from annotator to archivist.
 *
 * A new account may annotate but not submit. Submission access is requested
 * here, by agreeing to the archive's guidelines, and granted by an admin. The
 * agreements are the substance of the request rather than fine print, which is
 * why each is its own checkbox and the request cannot be sent until every one
 * is ticked.
 *
 * The list is sent with the request so the audit trail records what was agreed
 * to, not merely that something was.
 */
import { SUBMISSION_AGREEMENTS } from "~~/shared/utils/agreements";

const emit = defineEmits<{ requested: [] }>();

const { refreshSession } = useAuth();
const action = useAsyncAction("Could not submit request.");

const AGREEMENTS = SUBMISSION_AGREEMENTS;

const showForm = ref(false);
const checks = ref<boolean[]>(AGREEMENTS.map(() => false));

const allChecked = computed(() => checks.value.every(Boolean));

function openForm() {
  // Reset rather than resume: reopening after a cancel should not carry
  // half-ticked agreements back in.
  checks.value = AGREEMENTS.map(() => false);
  action.reset();
  showForm.value = true;
}

async function submit() {
  if (!allChecked.value) return;

  const ok = await action.run(async () => {
    await $fetch("/api/auth/request-submission-access", {
      method: "POST",
      body: { agreements: [...AGREEMENTS] },
    });
    // The request stamps submissionRequestedAt on the user, which is what
    // swaps this form for the awaiting-review notice.
    await refreshSession();
  });
  if (!ok) return;
  showForm.value = false;
  emit("requested");
}
</script>

<template>
  <div class="form-column">
    <div v-if="!showForm" class="request-cta">
      <p class="request-cta-copy">
        You can leave annotations on any restroom. To submit your own restroom
        scans, request access below.
      </p>
      <button type="button" class="primary-btn" @click="openForm">
        Request access to submit restroom scans
      </button>
    </div>

    <form v-else class="agreement-form" @submit.prevent="submit">
      <p class="agreement-intro">
        I agree to abide by the following guidelines when submitting restrooms:
      </p>

      <label v-for="(text, i) in AGREEMENTS" :key="text" class="agreement-row">
        <input v-model="checks[i]" type="checkbox" class="agreement-check" />
        <span>{{ text }}</span>
      </label>

      <p class="agreement-note">
        Admins reserve the right to deny, remove, and edit any submissions as
        they see fit, without notice. By submitting this request, you agree to
        these terms.
      </p>

      <p v-if="action.error" class="form-error">{{ action.error }}</p>

      <div class="agreement-actions">
        <button type="button" class="link-btn" @click="showForm = false">
          Cancel
        </button>
        <button
          type="submit"
          class="primary-btn"
          :disabled="!allChecked || action.loading"
        >
          {{ action.loading ? "…" : "Submit request" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.request-cta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.request-cta-copy {
  margin: 0;
  color: #666;
}

.agreement-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agreement-intro {
  margin: 0;
}

.agreement-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.agreement-check {
  margin: 2px 0 0;
  flex-shrink: 0;
}

.agreement-note {
  margin: 4px 0 0;
  font-size: 11px;
  color: #999;
  line-height: 1.5;
}

.agreement-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
</style>
