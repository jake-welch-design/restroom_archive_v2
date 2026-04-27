<script setup lang="ts">
const directoryRows = useDirectoryRows();
const { selected, selectedSlug, select } = useSelection();
const randomPick = useRandomRestroom();
const panelOpen = ref(true);

function togglePanel() {
  panelOpen.value = !panelOpen.value;
}

const currentIndex = computed(() => {
  const slug = selectedSlug.value;
  return directoryRows.value.findIndex((r) => r.slug === slug);
});

function goNext() {
  const list = directoryRows.value;
  if (!list.length || currentIndex.value < 0) return;
  select(list[(currentIndex.value + 1) % list.length].slug);
}

function goPrev() {
  const list = directoryRows.value;
  if (!list.length || currentIndex.value < 0) return;
  select(list[(currentIndex.value - 1 + list.length) % list.length].slug);
}
</script>

<template>
  <div class="shell">
    <aside class="panel" :class="{ closed: !panelOpen }">
      <slot />
    </aside>

    <button
      type="button"
      class="expand-tab"
      :class="{ closed: !panelOpen }"
      :aria-label="panelOpen ? 'Hide directory' : 'Show directory'"
      @click="togglePanel"
    >
      <span class="caret" :class="{ flip: !panelOpen }">‹</span>
    </button>

    <main class="viewer-panel">
      <p v-show="!panelOpen" class="corner-title">The Restroom Archive</p>
      <Viewer
        :model-url="selected?.modelUrl ?? null"
        :slug="selected?.slug ?? null"
        :thumb-url="selected?.thumbUrl ?? null"
      />

      <Transition name="fade">
        <div v-if="!panelOpen" class="bottom-gradient" />
      </Transition>

      <Transition name="fade">
        <div v-if="!panelOpen && selected" class="bottom-nav">
          <p class="bottom-nav-info">
            <span>{{ selected.name }}</span>
            <span>{{ selected.date }}</span>
            <span>{{ selected.location }}</span>
          </p>
          <div class="bottom-nav-controls">
            <button class="nav-btn" title="Previous" @click="goPrev">←</button>
            <button class="nav-btn" title="Random" @click="randomPick">
              Random
            </button>
            <button class="nav-btn" title="Next" @click="goNext">→</button>
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.shell {
  position: fixed;
  inset: 0;
  display: flex;
  background: #000;
  overflow: hidden;
}

.panel {
  flex: 0 0 auto;
  width: clamp(360px, 50%, 864px);
  height: 100%;
  background: #fff;
  overflow: hidden;
  transition: margin-left 0.35s ease;
  position: relative;
  z-index: 2;
}

.panel.closed {
  margin-left: calc(-1 * clamp(360px, 50%, 864px));
}

.expand-tab {
  position: absolute;
  left: calc(clamp(360px, 50%, 864px) - 4px);
  top: 61.5px;
  width: 22px;
  height: 69px;
  background: #fff;
  border: none;
  border-radius: 0 8px 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 0 0 4px;
  z-index: 1;
  touch-action: manipulation;
  transition: left 0.35s ease;
}

.expand-tab.closed {
  left: -4px;
}

.caret {
  font-size: 16px;
  line-height: 1;
  color: #000;
}
.caret.flip {
  display: inline-block;
  transform: rotate(180deg);
}

.viewer-panel {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  position: relative;
}
.corner-title {
  position: absolute;
  top: 0;
  left: 16px;
  margin: 0;
  padding: 16px 0;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 24px;
  font-weight: 400;
  color: #fff;
  text-shadow: 0px 0px 5px rgba(0, 0, 0, 0.2);
  /* mix-blend-mode: difference; */
  pointer-events: none;
  z-index: 1;
}

.bottom-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 150px;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.2) 100%
  );
  pointer-events: none;
  z-index: 2;
}

.bottom-nav {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 3;
  pointer-events: auto;
}
.bottom-nav-info {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  color: #fff;
  text-align: center;
  mix-blend-mode: difference;
}
.bottom-nav-info span {
  display: block;
}
.bottom-nav-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  padding: 4px 10px;
  transition: opacity 0.12s;
}
.nav-btn:hover {
  opacity: 0.8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 750px) {
  .shell {
    flex-direction: column;
  }
  .panel {
    flex: 0 0 auto;
    width: auto;
    height: calc(100dvh * 2 / 3);
    /* box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); */
    transition: margin-top 0.35s ease;
  }
  .panel.closed {
    margin-left: 0;
    margin-top: calc(-100dvh * 2 / 3);
  }

  .corner-title {
    padding: 8px 0;
  }

  .viewer-panel {
    display: block;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
  }
  .expand-tab {
    display: flex;
    position: fixed;
    left: auto;
    right: 16px;
    top: calc(100dvh * 2 / 3);
    width: 77.5px;
    height: 18px;
    border-radius: 0 0 8px 8px;
    padding: 0;
    transition: top 0.35s ease;
  }
  .expand-tab.closed {
    top: 0;
    left: auto;
  }
  .caret {
    transform: rotate(-90deg);
  }
  .caret.flip {
    display: inline-block;
    transform: rotate(90deg);
  }
  .bottom-nav {
    bottom: 0.75rem;
  }

  .bottom-nav-info {
    max-width: calc(100vw - 80px);
  }
}
</style>
