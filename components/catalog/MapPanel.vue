<script setup lang="ts">
import type {
  ArchiveDate as ArchiveDateEntry,
  RestroomSummary,
} from "~/types/restroom";

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
  /** Every scan of the restroom's catalog entry, oldest first. */
  scans?: ArchiveDateEntry[];
  activeTags: string[];
}>();

const emit = defineEmits<{
  close: [];
  select: [slug: string];
  toggleTag: [tag: string];
}>();
</script>

<template>
  <div class="map-panel thin-scroll">
    <div class="panel-header">
      <div class="panel-info">
        <span class="panel-name"
          ><SearchHighlight :text="restroom.name"
        /></span>
        <span class="panel-meta">
          <span
            ><SearchHighlight
              :text="restroom.location"
              kind="location"
              :country="restroom.country"
          /></span>
          <span class="panel-meta-sep"> · </span>
          <ArchiveDate
            :scans="scans ?? []"
            :slug="restroom.slug"
            :iso-date="restroom.isoDate"
            @select="emit('select', $event)"
          />
        </span>
      </div>
      <button class="panel-close" aria-label="Close" @click="emit('close')">
        ×
      </button>
    </div>

    <div class="description">
      <p class="desc-text">
        <SearchHighlight
          v-if="restroom.description"
          :text="restroom.description"
        />
        <template v-else>No description yet.</template>
      </p>

      <UserAttribution
        class="submitter-line"
        :user="restroom.submitter"
        prefix="Uploaded by "
      />
    </div>

    <DescriptorChips
      class="panel-chips"
      :tags="restroom.descriptors ?? []"
      :active-tags="activeTags"
      @toggle-tag="emit('toggleTag', $event)"
    />

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
  background: var(--paper);
  border: 1px solid var(--map-edge);
  padding: 8px 24px 20px;
  /* Sized to its content, up to a third of the map; scrolls past that. */
  max-height: 33.33%;
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
  border-bottom: 1px solid var(--list-inner-rule);
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
  color: var(--muted);
}

.panel-close {
  background: transparent;
  border: 0;
  padding: 0 4px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--faint);
  flex-shrink: 0;
}

.panel-close:hover {
  color: var(--ink);
}

.description {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.desc-text {
  margin: 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.35;
}
/* Matches the `.annotation-meta` further down the panel. */
.submitter-line {
  color: var(--faint);
  font-size: 12px;
}

/* The chips sit outside `.description`, and the panel is a plain block rather
   than a flex column, so they carry the 8px the description's gap would
   otherwise have given them. Without it they sit flush against the
   attribution while every other seam in the panel is 8px. */
.panel-chips {
  margin-top: 8px;
}

/* Divider matches the one under `.panel-header`, so the panel reads as three
   sections: name/date/location, description + descriptors, annotations. */
.annotations-section {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--list-inner-rule);
}

/* Sheet layout: the panel narrows to the map's left half, still docked to the
   bottom and sized to its content, up to the map's full height. Geometry only;
   the type below follows the panel's width instead. */
@media (max-width: 750px) {
  .map-panel {
    bottom: 8px;
    left: 8px;
    right: auto;
    box-sizing: border-box;
    width: 50%;
    max-height: calc(100% - 16px);
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
