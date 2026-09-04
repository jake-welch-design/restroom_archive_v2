<script setup lang="ts">
/**
 * The inline "why is this going?" form shown before an entry is taken down.
 *
 * Shared by the two places an admin can start a takedown — the Archive list and
 * an account's submissions in Accounts — so the wording of the warning and the
 * insistence on a reason are stated once rather than kept in step by hand.
 *
 * The reason is mandatory here, unlike a rejection's optional note. A rejected
 * submission was never in the archive and the submitter is still waiting to hear
 * about it; an entry taken down was published, and its absence is the first
 * thing the submitter notices. Confirm stays disabled until there is something
 * to send.
 *
 * Purely presentational: the parent owns the request, its pending state, and any
 * error, because each admin section has its own `useAdminAction`.
 */
const props = defineProps<{
  /** The entry's name, quoted back so a mis-clicked row is obvious. */
  name: string;
  /** True while the parent's request is in flight. */
  pending?: boolean;
}>();

const emit = defineEmits<{ cancel: []; confirm: [message: string] }>();

const message = ref("");

const canConfirm = computed(
  () => message.value.trim().length > 0 && !props.pending,
);

function confirm() {
  if (!canConfirm.value) return;
  emit("confirm", message.value.trim());
}

// Autofocus rather than making the admin click into the one field the form has.
const field = ref<HTMLTextAreaElement | null>(null);
onMounted(() => field.value?.focus());
</script>

<template>
  <div class="removal-form">
    <p class="removal-warning">
      Remove “{{ props.name }}” from the archive? Its scan file is deleted and
      this cannot be undone. The submitter sees the reason below.
    </p>
    <textarea
      ref="field"
      v-model="message"
      class="field-input field-textarea"
      placeholder="Reason (shown to the submitter)"
      rows="2"
      maxlength="500"
      @keydown.esc="emit('cancel')"
    />
    <div class="inline-actions">
      <button type="button" class="link-btn" @click="emit('cancel')">
        Cancel
      </button>
      <button
        type="button"
        class="btn btn-reject"
        :disabled="!canConfirm"
        @click="confirm"
      >
        {{ props.pending ? "…" : "Confirm removal" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.removal-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
  max-width: 480px;
}

.removal-warning {
  margin: 0;
  font-size: 12px;
  color: #c33;
}

.inline-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
