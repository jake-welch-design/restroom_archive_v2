<script setup lang="ts">
import type { Annotation } from "~/types/annotation";
import { formatMonthDayYear } from "~~/shared/utils/formatDate";

/**
 * The collapsible annotation list shown under a selected restroom.
 *
 * Appears in three places that reach a restroom differently but present its
 * annotations identically: the list view's expanded row, the grid view's
 * expanded tile, and the map's detail panel. Each of the three previously held
 * its own copy of this markup, its own fetch and delete handlers, and roughly
 * ninety lines of the same style.
 *
 * The three copies differed only in type sizes and spacing, which is what
 * `density` now selects. The section's own placement is left to the host, since
 * how the list sits in a row differs from how it sits in a tile.
 *
 * Selecting an annotation writes to the shared selection state rather than
 * emitting, because the consumer is the viewer in the layout, not the parent
 * component.
 */
const props = withDefaults(
  defineProps<{
    slug: string;
    /** `compact` is the grid tile, which has far less room. */
    density?: "comfortable" | "compact";
  }>(),
  { density: "comfortable" },
);

const slug = computed(() => props.slug);
const { data: annotations, refresh } = useAnnotations(slug);

const { isAdmin, user } = useAuth();
const { selectAnnotation } = useSelection();

const open = ref(false);
const deletingId = ref<number | null>(null);

/** Authors may delete their own annotations; admins may delete any. */
function canDelete(annotation: Annotation) {
  return isAdmin.value || user.value?.id === annotation.author.id;
}

function authorLabel(annotation: Annotation) {
  return annotation.author.displayName ?? `@${annotation.author.username}`;
}

async function deleteAnnotation(id: number) {
  deletingId.value = id;
  try {
    await $fetch(`/api/restrooms/${props.slug}/annotations/${id}`, {
      method: "DELETE",
    });
    await refresh();
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <!-- Clicks are contained: in the list and grid views this sits inside a row
       that selects on click, and interacting with an annotation must not
       re-trigger that. -->
  <div class="annotations" :class="density" @click.stop>
    <button
      type="button"
      class="annotations-toggle"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      Annotations ({{ annotations?.length ?? 0 }})
      <span class="toggle-caret" :class="{ open }">›</span>
    </button>

    <ul v-if="open && annotations?.length" class="annotation-list">
      <li
        v-for="a in annotations"
        :key="a.id"
        class="annotation-item"
        @click.stop="selectAnnotation(a.id)"
      >
        <div class="annotation-main">
          <span class="annotation-body">{{ a.body }}</span>
          <span class="annotation-meta">
            {{ authorLabel(a) }} · {{ formatMonthDayYear(a.createdAt) }}
          </span>
        </div>
        <button
          v-if="canDelete(a)"
          type="button"
          class="annotation-delete"
          :disabled="deletingId === a.id"
          @click.stop="deleteAnnotation(a.id)"
        >
          {{ deletingId === a.id ? "…" : "×" }}
        </button>
      </li>
    </ul>

    <p v-else-if="open" class="annotation-empty">No annotations yet.</p>
  </div>
</template>

<style scoped>
/* Both densities are expressed as one set of custom properties, so the rules
   below are written once and the size step is a single block. */
.annotations {
  --toggle-size: 14px;
  --body-size: 14px;
  --meta-size: 12px;
  --delete-size: 16px;
  --empty-size: 13px;
  --item-padding: 6px 0;
  --item-gap: 8px;
  --list-offset: 6px;
}

.annotations.compact {
  --toggle-size: 13px;
  --body-size: 12px;
  --meta-size: 11px;
  --delete-size: 14px;
  --empty-size: 12px;
  --item-padding: 4px 0;
  --item-gap: 6px;
  --list-offset: 4px;
}

/* The comfortable density steps down inside a narrow panel, which is where the
   grid tile already starts. Keyed to the panel rather than the window for the
   same reason the rest of the catalog is: a 50% panel at a 1120px viewport is
   as tight as a phone. */
@container panel (max-width: 560px) {
  .annotations:not(.compact) {
    --toggle-size: 12px;
    --body-size: 12px;
  }
}

.annotations-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: var(--toggle-size);
  color: #000;
  cursor: pointer;
}

.annotations-toggle:hover {
  color: #555;
}

.toggle-caret {
  display: inline-block;
  font-size: 12px;
  transform: rotate(0deg);
  transition: transform 0.15s;
}

.toggle-caret.open {
  transform: rotate(90deg);
}

.annotation-list {
  list-style: none;
  margin: var(--list-offset) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.annotation-item {
  display: flex;
  align-items: flex-start;
  gap: var(--item-gap);
  padding: var(--item-padding);
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
  /* Without this a long unbroken body pushes the delete button out of the
     tile rather than wrapping. */
  min-width: 0;
}

.annotation-body {
  font-size: var(--body-size);
  color: #000;
  line-height: 1.3;
}

.annotation-meta {
  font-size: var(--meta-size);
  color: #999;
}

.annotation-delete {
  background: transparent;
  border: 0;
  padding: 0 4px;
  font: inherit;
  font-size: var(--delete-size);
  line-height: 1;
  color: #999;
  cursor: pointer;
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
  font-size: var(--empty-size);
  color: #999;
}
</style>
