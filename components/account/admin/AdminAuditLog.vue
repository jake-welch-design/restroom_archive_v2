<script setup lang="ts">
/**
 * A record of every admin action taken, newest first.
 *
 * Append-only and read-only. Moderation here is one admin acting on another
 * person's account or work, so the point of the log is that it cannot be
 * curated by the people it records.
 *
 * Actions are stored as machine-readable keys (`user.ban`, `restroom.publish`)
 * and translated for display, so a rename here never invalidates history.
 */
import type { AuditLogEntry } from "~/types/account";

const { data: entries, refresh } = useAdminAuditLog();

// This component mounts only when its section is selected, so mounting is
// what makes the fetch lazy. The list is declared with `immediate: false`.
onMounted(() => refresh());

const ACTION_LABEL: Record<string, string> = {
  "user.approve": "approved user",
  "user.reject": "rejected user request",
  "user.ban": "banned user",
  "user.unban": "lifted ban on user",
  "user.mute": "muted user",
  "user.unmute": "unmuted user",
  "user.promote": "promoted user to admin",
  "user.delete": "deleted user",
  "user.rename": "renamed user",
  "user.revoke-submission": "revoked submission access",
  "restroom.publish": "published restroom",
  "restroom.reject": "rejected restroom",
  "restroom.remove": "removed restroom on request",
  "restroom.dismiss-removal": "dismissed removal request",
  "annotation.hide": "hid annotation",
  "annotation.unhide": "unhid annotation",
  "annotation.dismiss-reports": "dismissed annotation reports",
};

/** Falls back to the raw key, so an action added later still reads as itself. */
function actionLabel(action: string) {
  return ACTION_LABEL[action] ?? action;
}

/**
 * The parts of an entry's metadata worth showing inline.
 *
 * Metadata is free-form JSON per action, so this picks out the three keys that
 * actually carry meaning to a reader and ignores the rest rather than dumping
 * the object.
 */
function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";
  const parts: string[] = [];
  if (typeof metadata.days === "number") parts.push(`${metadata.days}d`);
  if (typeof metadata.username === "string") {
    parts.push(`→ @${metadata.username}`);
  }
  if (typeof metadata.message === "string" && metadata.message) {
    parts.push(`"${metadata.message}"`);
  }
  return parts.join(" · ");
}

/* --- Search and sort ------------------------------------------------------- */

type SortKey = "createdAt" | "actor" | "action";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "createdAt", label: "Date" },
  { key: "actor", label: "Admin" },
  { key: "action", label: "Action" },
];

function actorName(e: AuditLogEntry) {
  return (e.actor?.displayName || e.actor?.username || "").toLowerCase();
}

const { query, sortKey, sortDir, visible, isEmptyFromSearch } = useListControls<
  AuditLogEntry,
  SortKey
>({
  source: entries,
  // Searched on the translated label rather than the stored key, because that
  // is what is on screen: "banned" should find `user.ban`. The raw key is
  // included too, so a search for `restroom.publish` still works.
  searchFields: (e) => [
    actionLabel(e.action),
    e.action,
    e.actor?.username,
    e.actor?.displayName,
    metadataSummary(e.metadata),
  ],
  // Newest first, which is the order the endpoint returns and the only order a
  // log is normally read in.
  defaultKey: "createdAt",
  defaultDir: "desc",
  compare: (a, b, key) => {
    switch (key) {
      case "actor":
        return actorName(a).localeCompare(actorName(b)) || a.id - b.id;
      case "action":
        return (
          actionLabel(a.action).localeCompare(actionLabel(b.action)) ||
          a.id - b.id
        );
      default:
        return compareStamped(a, b, a.createdAt, b.createdAt);
    }
  },
});
</script>

<template>
  <div>
    <AdminListControls
      v-if="entries?.length"
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:sort-dir="sortDir"
      :sort-options="SORT_OPTIONS"
      search-label="Search the log"
      id-prefix="audit"
    />

    <div v-if="!entries?.length" class="empty">
      No admin actions recorded yet.
    </div>
    <div v-else-if="isEmptyFromSearch" class="empty">
      No entries match “{{ query }}”.
    </div>

    <ul v-else class="simple-list">
      <li v-for="entry in visible" :key="entry.id" class="simple-row">
        <div class="simple-main">
          <span class="simple-title">
            <UserAttribution
              v-if="entry.actor"
              :user="entry.actor"
              fallback="deleted admin"
            />
            <span v-else class="dim">deleted admin</span>
            <span class="audit-action">{{ actionLabel(entry.action) }}</span>
            <span v-if="entry.targetId" class="audit-target">
              #{{ entry.targetId }}
            </span>
          </span>
          <span class="simple-meta">
            {{ entry.createdAt }}
            <span
              v-if="metadataSummary(entry.metadata)"
              class="audit-meta-summary"
            >
              · {{ metadataSummary(entry.metadata) }}
            </span>
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* The gap is a margin rather than a space in the template. The name and the
   action are separate inline elements with the interpolation flush against the
   tag, and Vue's `condense` whitespace handling drops a leading space there, so
   the two ran together as "Jakebanned user". */
.audit-action {
  color: #000;
  margin-left: 4px;
}

/* The target id is a database key, not prose, so it is set in a monospace face
   at the support step to read as a reference rather than part of the sentence. */
.audit-target {
  color: #888;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  margin-left: 4px;
}

.audit-meta-summary {
  color: #666;
  word-break: break-word;
}
</style>
