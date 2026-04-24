<script setup lang="ts">
const props = defineProps<{
  modelValue: string[];
  placeholder?: string;
  maxLength?: number;
}>();
const emit = defineEmits<{ "update:modelValue": [tags: string[]] }>();

const draft = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

function exists(list: string[], tag: string) {
  const n = tag.toLowerCase();
  return list.some((t) => t.toLowerCase() === n);
}

function commit() {
  const v = draft.value.trim();
  if (!v) return;
  const max = props.maxLength ?? 40;
  const clipped = v.slice(0, max);
  if (!exists(props.modelValue, clipped)) {
    emit("update:modelValue", [...props.modelValue, clipped]);
  }
  draft.value = "";
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    commit();
  } else if (
    e.key === "Backspace" &&
    draft.value === "" &&
    props.modelValue.length > 0
  ) {
    emit("update:modelValue", props.modelValue.slice(0, -1));
  }
}

function remove(tag: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((t) => t !== tag),
  );
}

function focusInput() {
  inputRef.value?.focus();
}
</script>

<template>
  <div class="tag-input" @click="focusInput">
    <span v-for="t in modelValue" :key="t" class="tag">
      <span class="tag-text">{{ t }}</span>
      <button
        type="button"
        class="tag-x"
        aria-label="Remove tag"
        @click.stop="remove(t)"
      >
        ×
      </button>
    </span>
    <input
      ref="inputRef"
      v-model="draft"
      type="text"
      class="tag-inner"
      :placeholder="modelValue.length ? '' : (placeholder ?? 'Add descriptor')"
      @keydown="onKeydown"
      @blur="commit"
    />
  </div>
</template>

<style scoped>
.tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid #000;
  padding: 3px 0;
  cursor: text;
  min-height: 24px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #000;
  color: #fff;
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 200;
  line-height: 1.2;
  border-radius: 0;
}
.tag-x {
  background: transparent;
  border: 0;
  color: #fff;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.tag-x:hover {
  color: #ccc;
}
.tag-inner {
  border: 0;
  outline: 0;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  background: transparent;
  flex: 1 1 80px;
  min-width: 80px;
  color: #000;
}
</style>
