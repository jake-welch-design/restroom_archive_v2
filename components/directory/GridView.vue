<script setup lang="ts">
import type { RestroomSummary } from "~/types/restroom";
import type { Annotation } from "~/types/annotation";

const props = defineProps<{
  rows: RestroomSummary[];
  selectedSlug: string | null;
  activeTags: string[];
}>();
const emit = defineEmits<{
  select: [slug: string];
  toggleTag: [tag: string];
}>();

function isTagActive(tag: string) {
  const lower = tag.toLowerCase();
  return props.activeTags.some((t) => t.toLowerCase() === lower);
}

const { isAdmin, user } = useAuth();
const { selectAnnotation } = useSelection();

const expandedSlug = computed(() => props.selectedSlug);
const { data: annotations, refresh: refreshAnnotations } =
  useAnnotations(expandedSlug);

const annotationsOpen = ref(false);
const deletingId = ref<number | null>(null);

async function deleteAnnotation(slug: string, id: number) {
  deletingId.value = id;
  try {
    await $fetch(`/api/restrooms/${slug}/annotations/${id}`, {
      method: "DELETE",
    });
    await refreshAnnotations();
  } finally {
    deletingId.value = null;
  }
}

function authorLabel(a: Annotation) {
  return a.author.displayName ?? a.author.email;
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
  <div class="grid-wrap">
    <div class="grid">
      <button
        v-for="r in rows"
        :key="r.id"
        type="button"
        class="tile"
        :class="{ selected: r.slug === selectedSlug }"
        @click="emit('select', r.slug)"
      >
        <div class="thumb">
          <template v-if="r.slug === selectedSlug">
            <div class="expanded" @click.stop>
              <div class="tile-info selected">
                <span class="tile-name">{{ r.name }}</span>
                <span class="tile-date">{{ formatShortDate(r.isoDate) }}</span>
                <span class="tile-location">{{ r.location }}</span>
              </div>

              <p class="desc-text">
                {{ r.description ?? "No description yet." }}
              </p>

              <div v-if="r.descriptors?.length" class="descriptors-section" @click.stop>
                <button
                  v-for="t in r.descriptors"
                  :key="t"
                  type="button"
                  class="tag-chip"
                  :class="{ active: isTagActive(t) }"
                  @click.stop="emit('toggleTag', t)"
                >
                  {{ t }}
                </button>
              </div>

              <div class="annotations-section">
                <button
                  type="button"
                  class="annotations-toggle"
                  @click.stop="annotationsOpen = !annotationsOpen"
                >
                  Annotations ({{ annotations?.length ?? 0 }})
                  <span class="toggle-caret" :class="{ open: annotationsOpen }"
                    >›</span
                  >
                </button>
                <ul
                  v-if="annotationsOpen && annotations?.length"
                  class="annotation-list"
                >
                  <li
                    v-for="a in annotations"
                    :key="a.id"
                    class="annotation-item"
                    @click.stop="selectAnnotation(a.id)"
                  >
                    <div class="annotation-main">
                      <span class="annotation-body">{{ a.body }}</span>
                      <span class="annotation-meta">
                        {{ authorLabel(a) }} · {{ shortDate(a.createdAt) }}
                      </span>
                    </div>
                    <button
                      v-if="isAdmin || (user as any)?.id === a.author.id"
                      type="button"
                      class="annotation-delete"
                      :disabled="deletingId === a.id"
                      @click.stop="deleteAnnotation(r.slug, a.id)"
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
          <template v-else>
            <img
              v-if="r.thumbUrl"
              :src="r.thumbUrl"
              :alt="r.name"
              loading="lazy"
            />
            <div v-else class="thumb-placeholder" />
            <div class="tile-info">
              <span class="tile-name">{{ r.name }}</span>
              <span class="tile-date">{{ formatShortDate(r.isoDate) }}</span>
              <span class="tile-location">{{ r.location }}</span>
            </div>
          </template>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid-wrap {
  flex: 1 1 auto;
  overflow-y: auto;
  margin: 16px;
  font-family: Arial, Helvetica, sans-serif;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
@media (max-width: 750px) {
  .grid-wrap {
    margin: 8px;
  }
}
@media (max-width: 700px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 500px) {
  .grid {
    /* grid-template-columns: 1fr; */
    gap: 8px;
  }
}
.tile {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.tile:hover:not(.selected) .thumb img,
.tile:hover:not(.selected) .thumb-placeholder {
  opacity: 0.8;
}
.thumb {
  width: 100%;
  aspect-ratio: 1;
  background: #f0f0f0;
  overflow: hidden;
  position: relative;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  background: #000;
}
.tile-info {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px 12px 28px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #fff;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.55) 0%,
    rgba(0, 0, 0, 0.3) 60%,
    rgba(0, 0, 0, 0) 100%
  );
}
.tile-info.selected {
  position: static;
  color: #000;
  text-shadow: none;
  padding: 0;
  pointer-events: auto;
  background: none;
}
.expanded {
  width: 100%;
  height: 100%;
  background: #fff;
  border: 1px solid #000;
  padding: 10px 12px;
  overflow-y: auto;
  box-sizing: border-box;
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.desc-text {
  margin: 0;
  color: #000;
  font-size: 12px;
  line-height: 1.35;
}
.descriptors-section {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.tag-chip:hover:not(.active) {
  background: #f0f0f0;
}
.tag-chip.active {
  background: #000;
  color: #fff;
}
.tag-chip.active:hover {
  background: #333;
}
.annotations-section {
  margin-top: auto;
}
.annotations-toggle {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 13px;
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
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.annotation-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 0;
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
  min-width: 0;
}
.annotation-body {
  font-size: 12px;
  color: #000;
  line-height: 1.3;
}
.annotation-meta {
  font-size: 11px;
  color: #999;
}
.annotation-delete {
  background: transparent;
  border: 0;
  padding: 0 4px;
  font: inherit;
  font-size: 14px;
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
  font-size: 12px;
  color: #999;
}
</style>
