<script setup lang="ts">
import type { RestroomSummary } from "~/types/restroom";
import type { Annotation } from "~/types/annotation";

const props = defineProps<{
  restroom: RestroomSummary;
  activeTags: string[];
}>();

const emit = defineEmits<{
  close: [];
  toggleTag: [tag: string];
}>();

const slug = computed(() => props.restroom.slug);
const { data: annotations, refresh: refreshAnnotations } =
  useAnnotations(slug);
const annotationsOpen = ref(false);
const { isAdmin, user } = useAuth();
const { selectAnnotation } = useSelection();

const deletingId = ref<number | null>(null);
async function deleteAnnotation(id: number) {
  deletingId.value = id;
  try {
    await $fetch(`/api/restrooms/${props.restroom.slug}/annotations/${id}`, {
      method: "DELETE",
    });
    await refreshAnnotations();
  } finally {
    deletingId.value = null;
  }
}

function isTagActive(tag: string) {
  return props.activeTags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

function authorLabel(a: Annotation) {
  return a.author.displayName ?? `@${a.author.username}`;
}

function shortDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}
</script>

<template>
  <div class="map-panel">
    <div class="panel-header">
      <div class="panel-info">
        <span class="panel-name">{{ restroom.name }}</span>
        <span class="panel-meta"
          >{{ restroom.location }} · {{ formatShortDate(restroom.isoDate) }}</span
        >
      </div>
      <button class="panel-close" aria-label="Close" @click="emit('close')">
        ×
      </button>
    </div>

    <div class="description">
      <div class="label">Description:</div>
      <p class="desc-text">
        {{ restroom.description ?? "No description yet." }}
      </p>
    </div>

    <div v-if="restroom.descriptors?.length" class="descriptors-section">
      <div class="label">Descriptors:</div>
      <div class="descriptor-chips">
        <button
          v-for="t in restroom.descriptors"
          :key="t"
          type="button"
          class="tag-chip"
          :class="{ active: isTagActive(t) }"
          @click="emit('toggleTag', t)"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="annotations-section">
      <button
        type="button"
        class="annotations-toggle"
        @click="annotationsOpen = !annotationsOpen"
      >
        Annotations ({{ annotations?.length ?? 0 }})
        <span class="toggle-caret" :class="{ open: annotationsOpen }">›</span>
      </button>
      <ul v-if="annotationsOpen && annotations?.length" class="annotation-list">
        <li
          v-for="a in annotations"
          :key="a.id"
          class="annotation-item"
          @click="selectAnnotation(a.id)"
        >
          <div class="annotation-main">
            <span class="annotation-body">{{ a.body }}</span>
            <span class="annotation-meta"
              >{{ authorLabel(a) }} · {{ shortDate(a.createdAt) }}</span
            >
          </div>
          <button
            v-if="isAdmin || (user as any)?.id === a.author.id"
            type="button"
            class="annotation-delete"
            :disabled="deletingId === a.id"
            @click.stop="deleteAnnotation(a.id)"
          >
            {{ deletingId === a.id ? "…" : "×" }}
          </button>
        </li>
      </ul>
      <p v-else-if="annotationsOpen" class="annotation-empty">
        No annotations yet.
      </p>
    </div>
  </div>
</template>

<style scoped>
.map-panel {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  background: #fff;
  border: 1px solid #000;
  padding: 8px 24px 20px;
  max-height: 320px;
  overflow-y: auto;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  z-index: 5;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8e8e8;
}

.panel-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.panel-name {
  font-size: 16px;
  font-weight: 400;
}

.panel-meta {
  font-size: 13px;
  color: #666;
}

.panel-close {
  background: transparent;
  border: 0;
  padding: 0 4px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #999;
  flex-shrink: 0;
}

.panel-close:hover {
  color: #000;
}

.label {
  font-size: 14px;
  margin-bottom: 8px;
}

.desc-text {
  margin: 0;
  color: #000;
  font-size: 16px;
  line-height: 1.35;
}

.descriptors-section {
  margin-top: 16px;
}

.descriptor-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  background: #fff;
  color: #000;
  border: 1px solid #000;
  border-radius: 3px;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.tag-chip.active {
  background: #000;
  color: #fff;
}

.tag-chip:hover:not(.active) {
  background: #f0f0f0;
}

.annotations-section {
  margin-top: 16px;
}

.annotations-toggle {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.annotations-toggle:hover {
  color: #555;
}

.toggle-caret {
  display: inline-block;
  font-size: 12px;
  transition: transform 0.15s;
  transform: rotate(0deg);
}

.toggle-caret.open {
  transform: rotate(90deg);
}

.annotation-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.annotation-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #e8e8e8;
  cursor: pointer;
}

.annotation-item:hover {
  background: #f9f9f9;
}

.annotation-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.annotation-body {
  font-size: 14px;
  color: #000;
  line-height: 1.3;
}

.annotation-meta {
  font-size: 12px;
  color: #999;
}

.annotation-delete {
  background: transparent;
  border: 0;
  padding: 0 4px;
  font: inherit;
  font-size: 16px;
  color: #999;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}

.annotation-delete:hover:not(:disabled) {
  color: #c33;
}

.annotation-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.annotation-empty {
  margin: 4px 0 0;
  font-size: 13px;
  color: #999;
}

@media (max-width: 750px) {
  .map-panel {
    bottom: 8px;
    left: 8px;
    right: 8px;
    padding: 8px 12px 16px;
    max-height: 260px;
    font-size: 12px;
  }

  .panel-name {
    font-size: 12px;
  }

  .desc-text {
    font-size: 12px;
  }

  .label {
    font-size: 12px;
  }

  .annotation-body {
    font-size: 12px;
  }

  .annotations-toggle {
    font-size: 12px;
  }
}
</style>
