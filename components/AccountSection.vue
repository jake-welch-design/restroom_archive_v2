<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    count?: number | null;
    defaultOpen?: boolean;
    danger?: boolean;
  }>(),
  { count: null, defaultOpen: true, danger: false },
);

const emit = defineEmits<{ (e: "toggle", open: boolean): void }>();

const open = ref(props.defaultOpen);

function toggle() {
  open.value = !open.value;
  emit("toggle", open.value);
}
</script>

<template>
  <section class="account-section" :class="{ 'is-danger': danger }">
    <button
      type="button"
      class="account-section-header"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="caret">{{ open ? "▾" : "▸" }}</span>
      <span class="title-text">{{ title }}</span>
      <span v-if="count" class="count">{{ count }}</span>
    </button>
    <div v-show="open" class="account-section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.account-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0 0 16px;
  padding: 8px 12px;
  background: #f4f4f4;
  border: 1px solid #000;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: left;
  color: #000;
  cursor: pointer;
}
.account-section-header:hover {
  background: #e9e9e9;
}
.caret {
  display: inline-block;
  width: 12px;
  font-size: 12px;
  color: #666;
}
.title-text {
  flex: 0 1 auto;
}
.count {
  font-size: 11px;
  background: #000;
  color: #fff;
  border-radius: 6px;
  padding: 1px 7px;
  letter-spacing: 0;
}
.is-danger .account-section-header {
  background: #fbeaea;
  border-color: #c33;
  color: #c33;
}
.is-danger .account-section-header .caret {
  color: #c33;
}

@media (max-width: 750px) {
  .account-section-header {
    font-size: 13px;
  }
}
</style>
