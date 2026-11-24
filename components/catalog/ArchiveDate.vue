<script setup lang="ts">
import type { ArchiveDate } from "~/types/restroom";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";

/**
 * An entry's archive date, and for a combined entry the way to pick another.
 *
 * Most entries are one scan, and this is just their date as text. An entry an
 * admin has combined shows the date of the scan on screen, underlined with a
 * caret, and choosing another date selects that scan: the model, description
 * and annotations all follow, since they are that scan's.
 *
 * Two pickers behind the one label, chosen by the kind of pointer:
 *
 * - With a mouse or trackpad, a menu of our own, styled like the rest of the
 *   site. A native select's open list is drawn by the browser and the OS and
 *   cannot be styled outside Chrome. The menu is teleported to <body> and
 *   fixed in place, because the list and grid scroll inside `overflow` boxes
 *   that would clip it, and it opens upward when there is no room below.
 * - On a touch screen, the native `<select>`, laid invisibly over the label,
 *   so a phone gets its own wheel, which is easier with a thumb than a small
 *   menu and what people expect there.
 *
 * The server and the first client render always use the native select, since
 * neither knows the pointer yet; the menu takes over on mount where it should.
 * Either way the picker works before then.
 *
 * Clicks stop here. Choosing a native option makes Chrome fire a click on the
 * select after its change, and in the list that click reached the row, whose
 * own handler reselected the scan the row had been showing and undid the pick.
 */
const props = defineProps<{
  /** Every scan of the entry, oldest first. */
  scans: ArchiveDate[];
  /** The scan on screen. */
  slug: string;
  /** Its date, shown when there is nothing to pick between. */
  isoDate: string;
}>();

const emit = defineEmits<{ select: [slug: string] }>();

// Newest first, the order someone reaching for "another year" scans in.
const options = computed(() => [...props.scans].reverse());

// Every pick is passed on, the label's own date included. In the list, a row
// that isn't open still shows its picker, and there its own date is the one
// to open; selecting the scan already open is a no-op upstream anyway.
function choose(slug: string) {
  if (slug) emit("select", slug);
}

function onNativeChange(e: Event) {
  choose((e.target as HTMLSelectElement).value);
}

// --- Custom menu, for fine pointers ------------------------------------------

const useMenu = ref(false);
let pointerQuery: MediaQueryList | null = null;

function syncPointer() {
  useMenu.value = !!pointerQuery?.matches;
  if (!useMenu.value) close(false);
}

const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLUListElement | null>(null);
const open = ref(false);
const activeIndex = ref(0);
const menuStyle = ref<Record<string, string>>({});
const menuId = useId();

/** Gap between the label and the menu, and the margin kept from the screen. */
const GAP = 4;
const EDGE = 8;

function place() {
  const t = trigger.value;
  const m = menu.value;
  if (!t || !m) return;
  const r = t.getBoundingClientRect();
  const h = m.offsetHeight;
  const below = window.innerHeight - r.bottom - GAP - EDGE;
  const up = below < h && r.top - GAP - EDGE > below;
  const left = Math.min(
    Math.max(EDGE, r.left - 8),
    window.innerWidth - m.offsetWidth - EDGE,
  );
  menuStyle.value = {
    left: `${left}px`,
    top: up ? `${r.top - GAP - h}px` : `${r.bottom + GAP}px`,
    minWidth: `${r.width + 16}px`,
  };
}

async function openMenu(focusIndex?: number) {
  if (open.value) return;
  const current = options.value.findIndex((o) => o.slug === props.slug);
  activeIndex.value = focusIndex ?? Math.max(0, current);
  open.value = true;
  await nextTick();
  place();
  focusActive();
}

function close(returnFocus = true) {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) trigger.value?.focus();
}

function focusActive() {
  menu.value
    ?.querySelectorAll<HTMLElement>("[role=option]")
    [activeIndex.value]?.focus();
}

function pick(slug: string) {
  close();
  choose(slug);
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
    e.preventDefault();
    openMenu();
  }
}

function onMenuKeydown(e: KeyboardEvent) {
  const last = options.value.length - 1;
  const moves: Record<string, () => number> = {
    ArrowDown: () => Math.min(last, activeIndex.value + 1),
    ArrowUp: () => Math.max(0, activeIndex.value - 1),
    Home: () => 0,
    End: () => last,
  };
  if (moves[e.key]) {
    e.preventDefault();
    activeIndex.value = moves[e.key]();
    focusActive();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    pick(options.value[activeIndex.value].slug);
  } else if (e.key === "Escape") {
    e.preventDefault();
    close();
  } else if (e.key === "Tab") {
    close(false);
  }
}

// Outside the label and the menu closes it. Pointerdown rather than click, so
// the menu is gone before whatever was pressed reacts.
function onDocPointerDown(e: Event) {
  const target = e.target as Node;
  if (trigger.value?.contains(target) || menu.value?.contains(target)) return;
  close(false);
}

// The menu is fixed in place, so as the list scrolls under it, it follows its
// label rather than floating off it, and closes only once the label has left
// the screen. Closing on any scroll was too eager: focusing the label scrolls
// it into view, and that scroll lands just after a keyboard open, shutting the
// menu the moment it appeared.
function onScrollOrResize(e: Event) {
  if (e.type === "scroll" && menu.value?.contains(e.target as Node)) return;
  const r = trigger.value?.getBoundingClientRect();
  if (!r || r.bottom < 0 || r.top > window.innerHeight) close(false);
  else place();
}

watch(open, (isOpen) => {
  const method = isOpen ? "addEventListener" : "removeEventListener";
  document[method]("pointerdown", onDocPointerDown, true);
  window[method]("scroll", onScrollOrResize, true);
  window[method]("resize", onScrollOrResize);
});

onMounted(() => {
  pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  syncPointer();
  pointerQuery.addEventListener("change", syncPointer);
});

onBeforeUnmount(() => {
  pointerQuery?.removeEventListener("change", syncPointer);
  if (open.value) {
    open.value = false;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
  }
});
</script>

<template>
  <span
    v-if="scans.length > 1"
    class="archive-date"
    :title="open ? undefined : 'See the different versions of this restroom'"
    @click.stop
  >
    <button
      v-if="useMenu"
      ref="trigger"
      type="button"
      class="label trigger"
      :class="{ open }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      :aria-label="`Archive date ${formatDayMonthYear(isoDate)}, ${scans.length} available`"
      @click="open ? close() : openMenu()"
      @keydown="onTriggerKeydown"
    >
      <span class="date-text"
        ><SearchHighlight :text="formatDayMonthYear(isoDate)" kind="date"
      /></span>
      <svg
        class="caret"
        viewBox="0 0 9 6"
        width="9"
        height="6"
        aria-hidden="true"
      >
        <path
          d="M1 1l3.5 3.5L8 1"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>
    </button>

    <template v-else>
      <span class="label" aria-hidden="true">
        <span class="date-text"
          ><SearchHighlight :text="formatDayMonthYear(isoDate)" kind="date"
        /></span>
        <svg class="caret" viewBox="0 0 9 6" width="9" height="6">
          <path
            d="M1 1l3.5 3.5L8 1"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </svg>
      </span>
      <select
        class="native"
        :value="slug"
        :aria-label="`Archive date, ${scans.length} available`"
        @change="onNativeChange"
      >
        <option v-for="s in options" :key="s.slug" :value="s.slug">
          {{ formatDayMonthYear(s.isoDate) }}
        </option>
      </select>
    </template>

    <Teleport to="body">
      <ul
        v-if="open"
        :id="menuId"
        ref="menu"
        class="archive-date-menu"
        role="listbox"
        :aria-label="`Archive dates, ${scans.length} available`"
        :style="menuStyle"
        @keydown="onMenuKeydown"
      >
        <li
          v-for="(s, i) in options"
          :key="s.slug"
          role="option"
          tabindex="-1"
          class="archive-date-option"
          :class="{ current: s.slug === slug }"
          :aria-selected="s.slug === slug"
          @click="pick(s.slug)"
          @mouseenter="activeIndex = i"
          @focus="activeIndex = i"
        >
          {{ formatDayMonthYear(s.isoDate) }}
        </li>
      </ul>
    </Teleport>
  </span>
  <span v-else
    ><SearchHighlight :text="formatDayMonthYear(isoDate)" kind="date"
  /></span>
</template>

<style scoped>
.archive-date {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* The menu's trigger reads as the same bare text the native version's label
   does: no button chrome, the row's own type. */
.trigger {
  background: none;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.trigger:focus-visible {
  outline: 1px solid var(--ink);
  outline-offset: 2px;
}

/* Only the date is underlined, so the line stops before the caret. */
.date-text {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* The chevron the edit form's selects draw, for the same kind of control. It
   turns over while the menu is open. */
.caret {
  flex-shrink: 0;
  transition: transform 0.15s;
}

.trigger.open .caret {
  transform: rotate(180deg);
}

.native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  /* iOS zooms into a focused control under 16px; the select is invisible, so
     its own size costs nothing. */
  font-size: 16px;
}

.archive-date:has(.native:focus-visible) .label {
  outline: 1px solid var(--ink);
  outline-offset: 2px;
}

@media (hover: hover) {
  .archive-date:hover .label,
  .trigger.open {
    color: var(--ink-hover);
  }
}
</style>

<!-- Unscoped: the menu is teleported to <body>, outside this component's
     scoped attribute, and needs the site's look restated rather than
     inherited. White, a 1px black rule, Arial, the list's row hover. -->
<style>
.archive-date-menu {
  position: fixed;
  z-index: 1000;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--paper);
  border: 1px solid var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.3;
  color: var(--ink);
  max-height: 240px;
  overflow-y: auto;
  box-sizing: border-box;
}

.archive-date-option {
  padding: 5px 12px;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
}

.archive-date-option:hover,
.archive-date-option:focus {
  background: var(--canvas);
}

/* The date already on screen, in the grey the site marks "you are here" with. */
.archive-date-option.current {
  color: var(--ink-hover);
}
</style>
