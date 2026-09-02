<script setup lang="ts">
import type { RestroomSummary } from "~/types/restroom";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";

/**
 * Detail panel for the pin selected on the map.
 *
 * Reads as three stacked sections divided by hairlines: identity, description
 * with its descriptors, then annotations. The panel moves from the map's bottom
 * edge to its left side on a sheet layout, which is geometry only; the type
 * scale follows the panel's width instead.
 */
defineProps<{
  restroom: RestroomSummary;
  activeTags: string[];
}>();

const emit = defineEmits<{
  close: [];
  toggleTag: [tag: string];
}>();
</script>

<template>
  <div class="map-panel thin-scroll">
    <div class="panel-header">
      <div class="panel-info">
        <span class="panel-name">{{ restroom.name }}</span>
        <span class="panel-meta">
          <span>{{ restroom.location }}</span>
          <span class="panel-meta-sep"> · </span>
          <span>{{ formatDayMonthYear(restroom.isoDate) }}</span>
        </span>
      </div>
      <button class="panel-close" aria-label="Close" @click="emit('close')">
        ×
      </button>
    </div>

    <div class="description">
      <p class="desc-text">
        {{ restroom.description ?? "No description yet." }}
      </p>

      <DescriptorChips
        :tags="restroom.descriptors ?? []"
        :active-tags="activeTags"
        @toggle-tag="emit('toggleTag', $event)"
      />

      <UserAttribution
        class="submitter-line"
        :user="restroom.submitter"
        prefix="Uploaded by "
      />
    </div>

    <div class="annotations-section">
      <AnnotationList :slug="restroom.slug" />
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
  height: 33.33%;
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

.description {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.desc-text {
  margin: 0;
  color: #000;
  font-size: 12px;
  line-height: 1.35;
}
/* Matches the `.annotation-meta` below the divider. */
.submitter-line {
  color: #999;
  font-size: 12px;
}

/* Divider matches the one under `.panel-header`, so the panel reads as three
   sections: name/date/location, description + descriptors, annotations. */
.annotations-section {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid #e8e8e8;
}

/* Sheet layout: the panel moves off the map's bottom edge and onto its side.
   Geometry only; the type below follows the panel's width instead. */
@media (max-width: 750px) {
  .map-panel {
    top: 8px;
    bottom: 8px;
    left: 8px;
    right: auto;
    height: auto;
    box-sizing: border-box;
    width: 50%;
    max-height: none;
  }
}

/* Same panel-width step as the catalog chrome and the list. */
@container panel (max-width: 560px) {
  .map-panel {
    padding: 8px 12px 16px;
    font-size: 12px;
  }

  /* No room for name · location · date on one line at this width. */
  .panel-meta {
    display: flex;
    flex-direction: column;
  }

  .panel-meta-sep {
    display: none;
  }

  .panel-name {
    font-size: 12px;
  }
}
</style>
