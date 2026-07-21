<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), {
  ariaLabel: "More info",
});

const open = ref(false);

function show() {
  open.value = true;
}
function hide() {
  open.value = false;
}
function toggle() {
  open.value = !open.value;
}
</script>

<template>
  <span class="info-tooltip" @mouseenter="show" @mouseleave="hide">
    <button
      type="button"
      class="info-btn"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      @focus="show"
      @blur="hide"
      @click="toggle"
    >
      i
    </button>
    <span v-if="open" class="info-bubble" role="tooltip">
      <slot />
    </span>
  </span>
</template>

<style scoped>
.info-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.info-btn {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1px solid #666;
  background: transparent;
  color: #666;
  font: inherit;
  font-size: 10px;
  font-style: italic;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.info-btn:hover,
.info-btn:focus-visible {
  border-color: #000;
  color: #000;
}
.info-bubble {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 4px;
  width: max-content;
  max-width: 260px;
  z-index: 30;
  text-align: left;
}
.info-bubble :deep(ul) {
  margin: 4px 0 0;
  padding-left: 16px;
}
.info-bubble :deep(p) {
  margin: 0;
}
.info-bubble :deep(p + p) {
  margin-top: 6px;
}

@media (max-width: 750px) {
  .info-bubble {
    max-width: 200px;
  }
}
</style>
