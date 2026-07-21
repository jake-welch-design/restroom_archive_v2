<script setup lang="ts">
import { useThreeScene } from "~/composables/useThreeScene";

const props = defineProps<{
  modelUrl?: string | null;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const modelUrlRef = toRef(props, "modelUrl");

const { loading, error } = useThreeScene(canvasRef, modelUrlRef);
</script>

<template>
  <div class="submit-preview">
    <canvas v-if="modelUrl" ref="canvasRef" />
    <div v-else class="empty-state">Upload a scan to preview it here.</div>

    <div v-if="modelUrl && loading" class="loading-overlay">
      <img src="/toilet-loader.gif" alt="Loading..." width="120" height="120" />
    </div>
    <div v-else-if="modelUrl && error" class="status error">{{ error }}</div>
  </div>
</template>

<style scoped>
.submit-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 260px;
  background: #000;
  overflow: hidden;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
.empty-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #999;
  font-size: 14px;
  text-align: center;
  padding: 16px;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  padding: 16px;
  text-align: center;
  pointer-events: none;
}
.status.error {
  color: #ff6b6b;
}
</style>
