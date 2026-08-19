<script setup lang="ts">
const props = defineProps<{
  modelValue: string[];
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  suggestions?: string[];
}>();
const emit = defineEmits<{ "update:modelValue": [tags: string[]] }>();

const draft = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);

function exists(list: string[], tag: string) {
  const n = tag.toLowerCase();
  return list.some((t) => t.toLowerCase() === n);
}

// Suggestions not already selected, filtered by the current draft. Shown on
// focus (every previously-used tag, scrollable) and narrowed as the user types.
const filteredSuggestions = computed(() => {
  const all = props.suggestions ?? [];
  if (!all.length) return [];
  const q = draft.value.trim().toLowerCase();
  const available = all.filter((s) => !exists(props.modelValue, s));
  return q ? available.filter((s) => s.toLowerCase().includes(q)) : available;
});

const showDropdown = computed(() => open.value && filteredSuggestions.value.length > 0);

function add(tag: string) {
  const max = props.maxLength ?? 40;
  const clipped = tag.trim().slice(0, max);
  if (!clipped) return;
  if (!exists(props.modelValue, clipped)) {
    emit("update:modelValue", [...props.modelValue, clipped]);
  }
  draft.value = "";
  activeIndex.value = -1;
}

function commit() {
  const v = draft.value.trim();
  if (!v) return;
  add(v);
}

function selectSuggestion(tag: string) {
  add(tag);
  inputRef.value?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown" && showDropdown.value) {
    e.preventDefault();
    activeIndex.value =
      (activeIndex.value + 1) % filteredSuggestions.value.length;
  } else if (e.key === "ArrowUp" && showDropdown.value) {
    e.preventDefault();
    activeIndex.value =
      activeIndex.value <= 0
        ? filteredSuggestions.value.length - 1
        : activeIndex.value - 1;
  } else if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    if (activeIndex.value >= 0 && filteredSuggestions.value[activeIndex.value]) {
      add(filteredSuggestions.value[activeIndex.value]);
    } else {
      commit();
    }
  } else if (e.key === "Escape" && open.value) {
    e.preventDefault();
    open.value = false;
    activeIndex.value = -1;
  } else if (
    e.key === "Backspace" &&
    draft.value === "" &&
    props.modelValue.length > 0
  ) {
    emit("update:modelValue", props.modelValue.slice(0, -1));
  }
}

// Reset the highlighted suggestion whenever the visible list changes so the
// arrow-key cursor never points past the end.
watch(filteredSuggestions, () => {
  activeIndex.value = -1;
});

// The list scrolls now that it holds every previously-used tag — keep the
// arrow-key cursor inside the visible part of it.
watch(activeIndex, async (i) => {
  if (i < 0) return;
  await nextTick();
  const option = listRef.value?.children[i] as HTMLElement | undefined;
  option?.scrollIntoView({ block: "nearest" });
});

function remove(tag: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((t) => t !== tag),
  );
}

function focusInput() {
  inputRef.value?.focus();
}

function onFocus() {
  open.value = true;
}

// Commit the pending draft and close the dropdown when focus leaves the whole
// control. A short delay lets a suggestion click register before blur fires.
function onBlur() {
  setTimeout(() => {
    commit();
    open.value = false;
    activeIndex.value = -1;
  }, 120);
}
</script>

<template>
  <div class="tag-input-wrap">
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
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="showDropdown"
        :aria-label="ariaLabel ?? 'Add descriptor'"
        :placeholder="modelValue.length ? '' : (placeholder ?? 'Add descriptor')"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
      />
    </div>
    <ul v-if="showDropdown" ref="listRef" class="tag-suggestions" role="listbox">
      <li
        v-for="(s, i) in filteredSuggestions"
        :key="s"
        role="option"
        :aria-selected="i === activeIndex"
        class="tag-suggestion"
        :class="{ active: i === activeIndex }"
        @mousedown.prevent="selectSuggestion(s)"
        @mouseenter="activeIndex = i"
      >
        {{ s }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tag-input-wrap {
  position: relative;
}
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
  outline: none;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  background: transparent;
  flex: 1 1 80px;
  min-width: 80px;
  color: #000;
}

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 0;
  list-style: none;
  background: #fff;
  border: 1px solid #000;
  border-top: 0;
  max-height: 180px;
  overflow-y: auto;
}
.tag-suggestion {
  padding: 5px 8px;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
.tag-suggestion.active {
  background: #000;
  color: #fff;
}
</style>
