:disabled="!!busy"
<script setup lang="ts">
/**
 * The Weekly Report composer: builds an issue from the archive, previews the
 * email exactly as it will be sent, and sends it through Plunk.
 *
 * Admin-only, and its own page beside the video studio for the same reason: it
 * needs a large preview, which the account panel cannot give it. Same anatomy
 * too: a white panel of settings beside the output.
 *
 * The issue is assembled here from the catalog the page already has, so the
 * server only validates and renders it (shared/utils/weeklyReport.ts renders
 * both this preview and the sent email). The draft lives in localStorage, with
 * the id of the Plunk draft campaign it was last saved to.
 */
import type { RestroomSummary } from "~/types/restroom";
import { apiErrorMessage } from "~~/shared/utils/apiError";
import {
  compressForEmail,
  type EmailImageSlot,
} from "~/composables/emailImage";
import { formatDayMonthYear } from "~~/shared/utils/formatDate";
import {
  computeReportStats,
  updateLinkFallback,
  defaultSubject,
  previousWeek,
  renderWeeklyReport,
  submittedDay,
  type ReportEntry,
  type WeeklyReportIssue,
} from "~~/shared/utils/weeklyReport";

definePageMeta({ layout: false });
useHead({
  title: "Weekly Report",
  meta: [{ name: "robots", content: "noindex" }],
});

const { isAdmin } = useAuth();
const { data: restrooms } = await useRestrooms();

const entries = computed(() =>
  [...(restrooms.value ?? [])].sort(
    (a, b) => b.isoDate.localeCompare(a.isoDate) || b.id - a.id,
  ),
);
const bySlug = computed(
  () => new Map(entries.value.map((e) => [e.slug, e] as const)),
);

function toReportEntry(e: RestroomSummary): ReportEntry {
  return {
    slug: e.slug,
    name: e.name,
    isoDate: e.isoDate,
    location: e.location,
    imageUrl: e.thumbUrl,
  };
}

function entryLabel(e: RestroomSummary) {
  return `${e.name} · ${formatDayMonthYear(e.isoDate)} · ${e.location}`;
}

/**
 * Entries submitted between `start` and `end`, both inclusive, by the
 * Archive's clock: 12:00 AM on the first day to 11:59 PM on the last.
 */
function submittedIn(start: string, end: string) {
  return entries.value.filter((e) => {
    const day = submittedDay(e.createdAt);
    return day >= start && day <= end;
  });
}

/* --- The draft -------------------------------------------------------------- */

interface Draft {
  issue: WeeklyReportIssue;
  /** The subject follows the week until it is edited by hand. */
  subjectAuto: boolean;
  campaignId: string | null;
}

const DRAFT_KEY = "weeklyReport:draft";

function freshDraft(): Draft {
  const { start, end } = previousWeek();
  const week = submittedIn(start, end);
  const featured = week[0] ?? entries.value[0] ?? null;
  return {
    issue: {
      weekStart: start,
      weekEnd: end,
      subject: defaultSubject(start, end),
      preheader: "",
      featured: featured ? { ...toReportEntry(featured), note: "" } : null,
      submissions: week
        .filter((e) => e.slug !== featured?.slug)
        .slice(0, 6)
        .map(toReportEntry),
      notes: null,
      stats: computeReportStats(entries.value, start, end),
    },
    subjectAuto: true,
    campaignId: null,
  };
}

const draft = ref<Draft>(freshDraft());
const issue = computed(() => draft.value.issue);

onMounted(() => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Draft;
      // Drafts from before the Stats section, or from before it was split
      // into totals and the week (no `week` key): both halves, on.
      if (
        saved.issue.stats === undefined ||
        (saved.issue.stats && !("week" in saved.issue.stats))
      )
        saved.issue.stats = computeReportStats(
          entries.value,
          saved.issue.weekStart,
          saved.issue.weekEnd,
        );
      draft.value = saved;
    }
  } catch {
    // A corrupt or unreadable draft: start from this week instead.
  }
});
watch(
  draft,
  (d) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      // Private mode or a full quota: the draft just isn't kept.
    }
  },
  { deep: true },
);

function startNewIssue() {
  const warning = archivedThisWeek.value
    ? ""
    : " This week's issue isn't in the archive yet.";
  if (
    !window.confirm(
      `Clear this draft and start a new issue from last week?${warning}`,
    )
  )
    return;
  draft.value = freshDraft();
  status.value = null;
}

/* --- Week and subject ------------------------------------------------------- */

watch(
  () => [issue.value.weekStart, issue.value.weekEnd] as const,
  ([start, end]) => {
    if (draft.value.subjectAuto)
      draft.value.issue.subject = defaultSubject(start, end);
  },
);

function onSubjectInput() {
  draft.value.subjectAuto = false;
}

function resetSubject() {
  draft.value.subjectAuto = true;
  draft.value.issue.subject = defaultSubject(
    issue.value.weekStart,
    issue.value.weekEnd,
  );
}

/* --- Featured --------------------------------------------------------------- */

const featuredSlug = computed({
  get: () => issue.value.featured?.slug ?? "",
  set: (slug: string) => {
    const e = bySlug.value.get(slug);
    draft.value.issue.featured = e
      ? { ...toReportEntry(e), note: issue.value.featured?.note ?? "" }
      : null;
  },
});

/** The featured entry's own thumbnail, to tell it apart from an upload. */
const featuredThumb = computed(() =>
  issue.value.featured
    ? (bySlug.value.get(issue.value.featured.slug)?.thumbUrl ?? null)
    : null,
);
const featuredUploaded = computed(
  () =>
    !!issue.value.featured &&
    issue.value.featured.imageUrl !== featuredThumb.value,
);

/**
 * Uploads the file an <input type="file"> just picked, to the thumbnails
 * bucket. Resolves to its URL and a note on its size, measured against
 * `budget` bytes (what that slot can carry and still load quickly), or to
 * null and an error note.
 */
async function uploadPicked(
  e: Event,
  slot: EmailImageSlot,
  budget: number,
): Promise<{ url: string | null; note: string } | null> {
  const input = e.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = "";
  if (!picked) return null;
  const size = (bytes: number) => {
    const kb = Math.round(bytes / 1000);
    return kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${kb} KB`;
  };
  try {
    // Shrunk to what the email shows before it goes anywhere; see
    // composables/emailImage.ts.
    const { file, originalBytes, changed } = await compressForEmail(
      picked,
      slot,
    );
    const body = new FormData();
    body.append("file", file);
    const res = await $fetch<{ url: string; bytes: number }>(
      "/api/admin/newsletter/media",
      { method: "POST", body },
    );
    const shown = changed
      ? `${size(originalBytes)} → ${size(res.bytes)}`
      : size(res.bytes);
    return {
      url: res.url,
      note:
        res.bytes > budget
          ? `${shown}: over the ${size(budget)} that keeps an email quick to load.`
          : `${shown}.`,
    };
  } catch (err) {
    return { url: null, note: apiErrorMessage(err, "The upload failed.") };
  }
}

const uploading = ref(false);
const uploadNote = ref<string | null>(null);

async function uploadFeatured(e: Event) {
  if (!draft.value.issue.featured) return;
  uploading.value = true;
  uploadNote.value = null;
  const res = await uploadPicked(e, "featured", 1_000_000);
  uploading.value = false;
  if (!res) return;
  if (res.url && draft.value.issue.featured)
    draft.value.issue.featured.imageUrl = res.url;
  uploadNote.value = res.note;
}

function useThumbnail() {
  if (draft.value.issue.featured)
    draft.value.issue.featured.imageUrl = featuredThumb.value;
  uploadNote.value = null;
}

/* --- New submissions -------------------------------------------------------- */

const weekSubmissions = computed(() =>
  submittedIn(issue.value.weekStart, issue.value.weekEnd),
);
const chosen = computed(
  () => new Set(issue.value.submissions.map((s) => s.slug)),
);

function toggleSubmission(e: RestroomSummary) {
  const list = draft.value.issue.submissions;
  const i = list.findIndex((s) => s.slug === e.slug);
  if (i >= 0) list.splice(i, 1);
  else list.push(toReportEntry(e));
}

/**
 * Adds the picked entry and puts the menu back on "Choose an entry…". Done on
 * the element itself: resetting a bound value in a watcher changed it twice
 * before Vue rendered, so the menu went on showing the entry just added.
 */
function addSubmission(e: Event) {
  const select = e.target as HTMLSelectElement;
  const entry = bySlug.value.get(select.value);
  if (entry && !chosen.value.has(entry.slug))
    draft.value.issue.submissions.push(toReportEntry(entry));
  select.value = "";
}

function removeSubmission(slug: string) {
  draft.value.issue.submissions = issue.value.submissions.filter(
    (s) => s.slug !== slug,
  );
}

/** Chosen entries that are not in this week's list, which shows its own. */
const extraSubmissions = computed(() =>
  issue.value.submissions.filter(
    (s) => !weekSubmissions.value.some((w) => w.slug === s.slug),
  ),
);

/* Each chosen submission can swap its thumbnail for an uploaded image: a crop
   on one detail, say. Kept on the issue's own entry (`imageUrl`), so it is
   dropped with the entry if it's unticked. */

const submissionThumb = (slug: string) =>
  bySlug.value.get(slug)?.thumbUrl ?? null;

const submissionUploaded = (s: { slug: string; imageUrl: string | null }) =>
  s.imageUrl !== submissionThumb(s.slug);

const uploadingSlug = ref<string | null>(null);
const submissionNotes = ref<Record<string, string>>({});

async function uploadSubmission(slug: string, e: Event) {
  uploadingSlug.value = slug;
  const res = await uploadPicked(e, "tile", 300_000);
  uploadingSlug.value = null;
  if (!res) return;
  const entry = draft.value.issue.submissions.find((s) => s.slug === slug);
  if (res.url && entry) entry.imageUrl = res.url;
  submissionNotes.value = { ...submissionNotes.value, [slug]: res.note };
}

function useSubmissionThumbnail(slug: string) {
  const entry = draft.value.issue.submissions.find((s) => s.slug === slug);
  if (entry) entry.imageUrl = submissionThumb(slug);
  const { [slug]: _gone, ...rest } = submissionNotes.value;
  submissionNotes.value = rest;
}

/* --- Updates ---------------------------------------------------------------- */

const notesOn = computed({
  get: () => !!issue.value.notes,
  set: (on: boolean) => {
    draft.value.issue.notes = on
      ? {
          headline: "",
          body: "",
          linkLabel: "",
          linkUrl: "",
        }
      : null;
  },
});

/* --- Stats ------------------------------------------------------------------ */

/* Worked out from the catalog for the issue's week, and kept up to date while
   the week changes. What's on the issue when it's sent is what goes out. */

/** Fresh figures for the issue's week, keeping whichever halves are on. */
function refreshStats(totals: boolean, week: boolean) {
  const all = computeReportStats(
    entries.value,
    issue.value.weekStart,
    issue.value.weekEnd,
  );
  draft.value.issue.stats =
    totals || week
      ? { totals: totals ? all.totals : null, week: week ? all.week : null }
      : null;
}

const totalsOn = computed({
  get: () => !!issue.value.stats?.totals,
  set: (on: boolean) => refreshStats(on, weekStatsOn.value),
});
const weekStatsOn = computed({
  get: () => !!issue.value.stats?.week,
  set: (on: boolean) => refreshStats(totalsOn.value, on),
});

watch(
  () => [issue.value.weekStart, issue.value.weekEnd, entries.value] as const,
  () => {
    if (draft.value.issue.stats)
      refreshStats(totalsOn.value, weekStatsOn.value);
  },
);

/* --- Preview ---------------------------------------------------------------- */

const previewWidth = ref<600 | 375>(600);
const origin = ref("https://restroomarchive.com");
onMounted(() => (origin.value = window.location.origin));

const html = computed(() =>
  renderWeeklyReport(issue.value, {
    siteUrl: origin.value,
    unsubscribeUrl: "#",
  }),
);
/** Gmail clips a message over 102 KB behind a "View entire message" link. */
const sizeKb = computed(() => Math.round(new Blob([html.value]).size / 1000));

/* --- Sending ---------------------------------------------------------------- */

const busy = ref<"test" | "send" | "archive" | null>(null);
const status = ref<{ ok: boolean; text: string } | null>(null);

async function post(path: "test" | "send") {
  return $fetch<{ campaignId: string; sentTo?: string; archived?: boolean }>(
    `/api/admin/newsletter/${path}`,
    {
      method: "POST",
      body: { issue: issue.value, campaignId: draft.value.campaignId },
    },
  );
}

async function sendTest() {
  busy.value = "test";
  status.value = null;
  try {
    const res = await post("test");
    draft.value.campaignId = res.campaignId;
    status.value = { ok: true, text: `Test sent to ${res.sentTo}.` };
  } catch (e) {
    status.value = { ok: false, text: apiErrorMessage(e, "The test failed.") };
  } finally {
    busy.value = null;
  }
}

async function sendToSubscribers() {
  if (
    !window.confirm(
      `Send “${issue.value.subject}” to every Weekly Report subscriber? This can't be undone.`,
    )
  )
    return;
  busy.value = "send";
  status.value = null;
  try {
    const res = await post("send");
    // A sent campaign is frozen in Plunk; further edits start a new one.
    draft.value.campaignId = null;
    await loadArchive();
    status.value = res.archived
      ? {
          ok: true,
          text: "Sending to subscribers. Plunk has it from here, and the issue is saved to the archive.",
        }
      : {
          ok: false,
          text: "Sending to subscribers, but the issue wasn't saved to the archive. Use Add to archive below; don't send it again.",
        };
  } catch (e) {
    status.value = { ok: false, text: apiErrorMessage(e, "Sending failed.") };
  } finally {
    busy.value = null;
  }
}

/* --- The archive ------------------------------------------------------------ */

/* Sent issues are kept in D1, one per week, to show again later. Sending
   saves one; "Add to archive" saves the draft by hand, for an issue sent
   before the archive existed or a correction to one already in it. */

interface ArchivedIssue {
  weekStart: string;
  weekEnd: string;
  subject: string;
  sentAt: string;
  updatedAt: string;
}

const archived = ref<ArchivedIssue[] | null>(null);

async function loadArchive() {
  try {
    archived.value = (
      await $fetch<{ issues: ArchivedIssue[] }>("/api/admin/newsletter/archive")
    ).issues;
  } catch {
    archived.value = null;
  }
}
onMounted(loadArchive);

const archivedThisWeek = computed(
  () =>
    archived.value?.find((a) => a.weekStart === issue.value.weekStart) ?? null,
);

/** "Sent 22 Nov 2026", on the Archive's clock (the column is UTC). */
const archiveNote = computed(() => {
  if (!archived.value) return "";
  const a = archivedThisWeek.value;
  if (!a) return "This week isn't in the archive yet. Sending adds it.";
  const sent = formatDayMonthYear(submittedDay(a.sentAt));
  const updated = formatDayMonthYear(submittedDay(a.updatedAt));
  return `In the archive: sent ${sent}${updated !== sent ? `, updated ${updated}` : ""}.`;
});

async function addToArchive() {
  const a = archivedThisWeek.value;
  const question = a
    ? `Replace the archived issue for this week with this draft?`
    : `Add “${issue.value.subject}” to the archive as a sent issue? Only do this for an issue that has gone out.`;
  if (!window.confirm(question)) return;
  busy.value = "archive";
  status.value = null;
  try {
    archived.value = (
      await $fetch<{ issues: ArchivedIssue[] }>(
        "/api/admin/newsletter/archive",
        { method: "POST", body: { issue: issue.value } },
      )
    ).issues;
    status.value = { ok: true, text: "Saved to the archive." };
  } catch (e) {
    status.value = {
      ok: false,
      text: apiErrorMessage(e, "Saving to the archive failed."),
    };
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="nl-shell">
    <aside class="nl-panel">
      <CatalogHeader />

      <div v-if="!isAdmin" class="nl-body">
        <p class="empty">The Weekly Report is edited by admins.</p>
      </div>

      <template v-else>
        <div class="nl-body thin-scroll">
          <header class="nl-head">
            <h1 class="nl-title">Weekly Report</h1>
            <span class="nl-head-links">
              <button type="button" class="link-btn" @click="startNewIssue">
                New issue
              </button>
              <NuxtLink to="/account?tab=admin" class="link-btn">
                Back to admin
              </NuxtLink>
            </span>
          </header>

          <section class="settings-list" aria-label="Issue">
            <div class="settings-row">
              <span class="settings-label">Week</span>
              <div class="nl-inline">
                <input
                  v-model="draft.issue.weekStart"
                  type="date"
                  class="field-input"
                  aria-label="Week starts"
                />
                <span>to</span>
                <input
                  v-model="draft.issue.weekEnd"
                  type="date"
                  class="field-input"
                  aria-label="Week ends"
                />
              </div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="nl-subject">Subject</label>
              <div class="nl-inline">
                <input
                  id="nl-subject"
                  v-model="draft.issue.subject"
                  class="field-input nl-grow"
                  maxlength="200"
                  @input="onSubjectInput"
                />
                <button
                  v-if="!draft.subjectAuto"
                  type="button"
                  class="link-btn"
                  @click="resetSubject"
                >
                  Reset
                </button>
              </div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="nl-preheader"
                >Preview text</label
              >
              <input
                id="nl-preheader"
                v-model="draft.issue.preheader"
                class="field-input nl-grow"
                maxlength="200"
                placeholder="The line inboxes show after the subject"
              />
            </div>
          </section>

          <section class="settings-list" aria-label="Updates">
            <h2 class="settings-group-label">Updates</h2>
            <div class="settings-row">
              <label class="nl-inline">
                <input v-model="notesOn" type="checkbox" />
                <span>Include an update this week</span>
              </label>
            </div>
            <template v-if="draft.issue.notes">
              <div class="settings-row">
                <label class="settings-label" for="nl-notes-headline"
                  >Headline</label
                >
                <input
                  id="nl-notes-headline"
                  v-model="draft.issue.notes.headline"
                  class="field-input nl-grow"
                  maxlength="200"
                />
              </div>
              <div class="settings-row">
                <label class="settings-label" for="nl-notes-body">Body</label>
                <textarea
                  id="nl-notes-body"
                  v-model="draft.issue.notes.body"
                  class="field-input field-textarea nl-grow"
                  rows="5"
                />
              </div>
              <div class="settings-row">
                <label class="settings-label" for="nl-notes-url"
                  >Link URL</label
                >
                <input
                  id="nl-notes-url"
                  v-model="draft.issue.notes.linkUrl"
                  class="field-input nl-grow"
                  placeholder="https://… or a page on the site, like /about"
                  maxlength="500"
                />
              </div>
              <div class="settings-row">
                <label class="settings-label" for="nl-notes-link-text"
                  >Link text</label
                >
                <input
                  id="nl-notes-link-text"
                  v-model="draft.issue.notes.linkLabel"
                  class="field-input nl-grow"
                  :placeholder="updateLinkFallback(draft.issue.notes.linkUrl)"
                  maxlength="100"
                />
                <span class="settings-note"
                  >Left empty, it reads as shown. No link is shown without a
                  URL.</span
                >
              </div>
            </template>
          </section>

          <section class="settings-list" aria-label="Stats">
            <h2 class="settings-group-label">Stats</h2>
            <div class="settings-row">
              <label class="nl-inline">
                <input v-model="totalsOn" type="checkbox" />
                <span>Total stats</span>
              </label>
              <span class="settings-note"
                >Restrooms, archivists, countries and cities, up to the last day
                of the week.</span
              >
            </div>
            <div class="settings-row">
              <label class="nl-inline">
                <input v-model="weekStatsOn" type="checkbox" />
                <span>Weekly stats</span>
              </label>
              <span class="settings-note"
                >The archivist of the week and the week's new countries, U.S.
                states and cities. Rows with nothing new are left out.</span
              >
            </div>
          </section>

          <section class="settings-list" aria-label="Featured scan">
            <h2 class="settings-group-label">Featured scan</h2>
            <div class="settings-row">
              <label class="settings-label" for="nl-featured">Entry</label>
              <select
                id="nl-featured"
                v-model="featuredSlug"
                class="field-input nl-grow"
              >
                <option value="">None</option>
                <option v-for="e in entries" :key="e.slug" :value="e.slug">
                  {{ entryLabel(e) }}
                </option>
              </select>
            </div>
            <template v-if="draft.issue.featured">
              <div class="settings-row">
                <span class="settings-label">Image</span>
                <div class="nl-inline">
                  <span>{{
                    featuredUploaded ? "Uploaded image" : "The scan's thumbnail"
                  }}</span>
                  <label class="btn nl-file">
                    {{ uploading ? "Uploading…" : "Upload GIF…" }}
                    <input
                      type="file"
                      accept="image/gif,image/png,image/jpeg"
                      :disabled="uploading"
                      @change="uploadFeatured"
                    />
                  </label>
                  <button
                    v-if="featuredUploaded"
                    type="button"
                    class="link-btn"
                    @click="useThumbnail"
                  >
                    Use thumbnail
                  </button>
                </div>
                <span class="settings-note">{{
                  uploadNote ??
                  "Best as a 3:2 GIF from the video studio. Uploads are shrunk to fit: GIFs to 600 wide, other images to 1072. Outlook shows only a GIF's first frame."
                }}</span>
              </div>
              <div class="settings-row">
                <label class="settings-label" for="nl-featured-note"
                  >Note</label
                >
                <textarea
                  id="nl-featured-note"
                  v-model="draft.issue.featured.note"
                  class="field-input field-textarea nl-grow"
                  rows="3"
                  placeholder="A few sentences about this restroom"
                />
              </div>
            </template>
          </section>

          <section class="settings-list" aria-label="New submissions">
            <h2 class="settings-group-label">New submissions</h2>
            <p v-if="!weekSubmissions.length" class="settings-note">
              Nothing was submitted that week.
            </p>
            <ul class="simple-list">
              <li
                v-for="e in weekSubmissions"
                :key="e.slug"
                class="simple-row nl-check"
              >
                <input
                  :id="`nl-sub-${e.slug}`"
                  type="checkbox"
                  :checked="chosen.has(e.slug)"
                  @change="toggleSubmission(e)"
                />
                <label :for="`nl-sub-${e.slug}`" class="simple-main">
                  <span class="simple-title">{{ e.name }}</span>
                  <span class="simple-meta"
                    >{{ formatDayMonthYear(e.isoDate) }} ·
                    {{ e.location }}</span
                  >
                </label>
              </li>
              <li
                v-for="s in extraSubmissions"
                :key="s.slug"
                class="simple-row nl-check"
              >
                <span class="simple-main">
                  <span class="simple-title">{{ s.name }}</span>
                  <span class="simple-meta"
                    >{{ formatDayMonthYear(s.isoDate) }} ·
                    {{ s.location }}</span
                  >
                </span>
                <button
                  type="button"
                  class="link-btn"
                  @click="removeSubmission(s.slug)"
                >
                  Remove
                </button>
              </li>
            </ul>
            <div class="settings-row">
              <label class="settings-label" for="nl-add">Add another</label>
              <select
                id="nl-add"
                class="field-input nl-grow"
                @change="addSubmission"
              >
                <option value="">Choose an entry…</option>
                <option
                  v-for="e in entries"
                  :key="e.slug"
                  :value="e.slug"
                  :disabled="chosen.has(e.slug)"
                >
                  {{ entryLabel(e) }}
                </option>
              </select>
              <span class="settings-note"
                >{{ draft.issue.submissions.length }} chosen. They sit two to a
                row; an even number fills the grid.</span
              >
            </div>
            <div v-if="draft.issue.submissions.length" class="settings-row">
              <span class="settings-label">Images</span>
              <ul class="simple-list nl-images">
                <li
                  v-for="s in draft.issue.submissions"
                  :key="s.slug"
                  class="simple-row nl-image-row"
                >
                  <img
                    v-if="s.imageUrl"
                    :src="s.imageUrl"
                    alt=""
                    class="nl-image-thumb"
                  />
                  <span v-else class="nl-image-thumb" aria-hidden="true" />
                  <span class="simple-main">
                    <span class="simple-title">{{ s.name }}</span>
                    <span class="simple-meta">{{
                      submissionNotes[s.slug] ??
                      (submissionUploaded(s) ? "Uploaded image" : "Thumbnail")
                    }}</span>
                  </span>
                  <button
                    v-if="submissionUploaded(s)"
                    type="button"
                    class="link-btn"
                    @click="useSubmissionThumbnail(s.slug)"
                  >
                    Use thumbnail
                  </button>
                  <label class="btn nl-file">
                    {{ uploadingSlug === s.slug ? "Uploading…" : "Upload…" }}
                    <input
                      type="file"
                      accept="image/gif,image/png,image/jpeg"
                      :aria-label="`Upload an image for ${s.name}`"
                      :disabled="uploadingSlug !== null"
                      @change="uploadSubmission(s.slug, $event)"
                    />
                  </label>
                </li>
              </ul>
              <span class="settings-note"
                >In the order they appear. Use square images: any other shape
                throws the grid out of line. Uploads are shrunk to 520 wide
                (GIFs to 260).</span
              >
            </div>
          </section>
        </div>

        <footer class="nl-foot">
          <p
            v-if="status"
            :class="status.ok ? 'field-hint' : 'form-error'"
            role="status"
          >
            {{ status.text }}
          </p>
          <div class="nl-foot-row">
            <button
              type="button"
              class="btn"
              :disabled="!!busy"
              @click="sendTest"
            >
              {{ busy === "test" ? "Sending test…" : "Send test to me" }}
            </button>
            <button
              type="button"
              class="primary-btn"
              :disabled="!!busy"
              @click="sendToSubscribers"
            >
              {{ busy === "send" ? "Sending…" : "Send to subscribers" }}
            </button>
          </div>
          <div v-if="archived" class="nl-foot-row nl-archive">
            <span class="settings-note">{{ archiveNote }}</span>
            <button
              type="button"
              class="link-btn"
              :disabled="!!busy"
              @click="addToArchive"
            >
              {{
                busy === "archive"
                  ? "Saving…"
                  : archivedThisWeek
                    ? "Update archive"
                    : "Add to archive"
              }}
            </button>
          </div>
        </footer>
      </template>
    </aside>

    <main v-if="isAdmin" class="nl-stage">
      <div class="nl-stage-bar">
        <div class="nl-seg" role="radiogroup" aria-label="Preview width">
          <button
            type="button"
            role="radio"
            class="nl-seg-btn"
            :class="{ active: previewWidth === 600 }"
            :aria-checked="previewWidth === 600"
            @click="previewWidth = 600"
          >
            Desktop
          </button>
          <button
            type="button"
            role="radio"
            class="nl-seg-btn"
            :class="{ active: previewWidth === 375 }"
            :aria-checked="previewWidth === 375"
            @click="previewWidth = 375"
          >
            Mobile
          </button>
        </div>
        <span class="nl-size" :class="{ warn: sizeKb > 90 }"
          >{{ sizeKb }} KB of Gmail's 102 KB</span
        >
      </div>
      <div class="nl-stage-scroll thin-scroll">
        <iframe
          class="nl-preview"
          title="Email preview"
          :srcdoc="html"
          :style="{ width: `${previewWidth + 48}px` }"
          sandbox="allow-same-origin"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.nl-shell {
  position: fixed;
  inset: 0;
  display: flex;
  background: #f4f4f4;
  overflow: hidden;
  font-family: Arial, Helvetica, sans-serif;
}

.nl-panel {
  flex: 0 0 auto;
  width: clamp(360px, 38%, 560px);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #000;
  font-size: 13px;
  line-height: 1.4;
  border-right: 1px solid #000;
  container: panel / inline-size;
}

.nl-body {
  --gutter: 20px;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 var(--gutter) var(--gutter);
}

.nl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-inline: calc(-1 * var(--gutter));
  padding: 10px var(--gutter);
  border-bottom: 1px solid #000;
  margin-bottom: 4px;
}

.nl-title {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
}

.nl-head-links {
  display: flex;
  gap: 4px;
}

.settings-list + .settings-list {
  margin-top: 20px;
}

.settings-group-label {
  margin: 12px 0 0;
  font-weight: 400;
}

.nl-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1 1 100%;
}

.nl-grow {
  flex: 1 1 100%;
  min-width: 0;
  box-sizing: border-box;
}

.nl-inline .nl-grow {
  flex: 1 1 200px;
}

/* A file input dressed as one of the account area's outline buttons. */
.nl-file {
  position: relative;
  cursor: pointer;
}
.nl-file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.nl-images {
  flex: 1 1 100%;
  margin: 0;
}
.nl-image-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.nl-image-thumb {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  object-fit: cover;
  background: #f0f0f0;
}
.nl-image-row .simple-main {
  flex: 1 1 auto;
  min-width: 0;
}

/* .simple-row spreads its children to either end, which suits a title with a
   button at the far side but pushed these labels away from their checkboxes.
   The label sits beside its box and takes the rest of the row, so "Remove"
   still lands at the right. */
.nl-check {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
}
.nl-check .simple-main {
  flex: 1 1 auto;
  cursor: pointer;
}

.nl-foot {
  flex: 0 0 auto;
  border-top: 1px solid #000;
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nl-foot p {
  margin: 0;
}
.nl-foot-row {
  display: flex;
  gap: 8px;
}
.nl-archive {
  justify-content: space-between;
  align-items: baseline;
}
.nl-archive .link-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.nl-stage {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.nl-stage-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  font-size: 12px;
}

.nl-seg {
  display: flex;
}
.nl-seg-btn {
  background: #fff;
  border: 1px solid #000;
  margin-right: -1px;
  padding: 5px 12px;
  font: inherit;
  color: #666;
  cursor: pointer;
}
.nl-seg-btn.active {
  background: #000;
  color: #fff;
}

.nl-size {
  color: #666;
}
.nl-size.warn {
  color: var(--danger);
}

.nl-stage-scroll {
  flex: 1 1 auto;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 0 20px 20px;
}

.nl-preview {
  height: 100%;
  min-height: 600px;
  border: 0;
  background: #f4f4f4;
  transition: width 0.2s ease;
}
</style>
