<script setup lang="ts">
/**
 * The archive's terms and privacy statement, as a modal.
 *
 * Built on native <dialog> rather than a hand-rolled overlay: showModal() gives
 * the focus trap, the Escape handler, the inert background and the ::backdrop
 * for free, and all of them are easy to get subtly wrong by hand.
 *
 * This is the single source of the long-form legal text. The About page keeps
 * only a short summary that links here, so the two can't drift apart.
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (open) => {
    const el = dialog.value;
    if (!el) return;
    // showModal() on an already-open dialog throws, and close() on a closed one
    // is a no-op that still fires `close`, which would loop back through emit.
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  },
);

// Clicking the backdrop resolves to the <dialog> itself as the event target;
// clicks on anything inside resolve to that child. Comparing against the
// element is what separates the two without a wrapper div.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) emit("close");
}
</script>

<template>
  <dialog
    ref="dialog"
    class="legal-dialog"
    aria-labelledby="legal-title"
    @close="emit('close')"
    @click="onClick"
  >
    <div class="legal-head">
      <h2 id="legal-title">Privacy and Usage Statement</h2>
      <button
        type="button"
        class="legal-close"
        aria-label="Close"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <div class="legal-body thin-scroll">
      <h3>Terms</h3>

      <h4>1. Scope</h4>
      <p>
        The Restroom Archive is a curated archive of 3D scans of publicly
        accessible restrooms. Use of the site constitutes acceptance of these
        terms. Submitting a scan also constitutes acceptance of section 2.
      </p>

      <h4>2. Contributor rights</h4>
      <p>
        Archivists own the scans they contribute and retain copyright in them.
        Contributing does not transfer ownership and does not restrict an
        Archivist from using their own scan anywhere else, for any purpose.
      </p>
      <p>
        Submission grants the archive a
        <strong>sole, perpetual, irrevocable, worldwide license</strong> to
        store, preserve, display, and present the scan as part of the archive.
        This includes the right to produce the technical copies and derivatives
        that hosting requires, such as thumbnails, compressed or optimised
        versions, and format conversions.
      </p>
      <p>
        The license is sole rather than exclusive. An exclusive license would
        bar the Archivist from using their own work; a sole license does not.
        The archive is the only party that may hold these rights, and no third
        party may be granted a license to a scan while it remains in the
        archive, but the Archivist&rsquo;s own use is unaffected.
      </p>
      <p>
        The archive uses contributed scans on this site and nowhere else. The
        commitments in section 3 state the limits of that use.
      </p>
      <p>
        Submission confirms that the scan is the Archivist&rsquo;s own work,
        that it is theirs to contribute, and that they held the right to scan
        the space.
      </p>

      <h4>3. Archive commitments</h4>
      <p>The archive does not and will not:</p>
      <ul>
        <li>Sell, rent, or otherwise commercialise contributed scans.</li>
        <li>
          Transfer or assign them to another party unless these commitments
          transfer intact.
        </li>
        <li>
          Sublicense or redistribute them. There are no dataset releases, bulk
          exports, partner feeds, or download endpoints.
        </li>
        <li>
          Use them, or permit their use, as training, fine-tuning, evaluation,
          or grounding data for machine learning models.
        </li>
      </ul>

      <h4>4. Permitted use</h4>
      <p>
        <strong>All rights reserved.</strong> Viewing, browsing, linking,
        citing, and writing about the archive are permitted. No license to reuse
        the scans is granted to any party, including visitors, search engines,
        and AI developers. Downloading, extracting, redistributing, and building
        on scan geometry require written permission.
      </p>
      <p>
        Use of archive content as training data for machine learning is
        prohibited and expressly reserved under Article 4(3) of Directive (EU)
        2019/790 and equivalent text-and-data-mining provisions in other
        jurisdictions. The reservation applies regardless of how a copy was
        obtained, including through third-party crawls and redistributed
        datasets.
      </p>

      <h4>5. Accounts</h4>
      <p>
        Account holders are responsible for activity under their account.
        Submission access is granted case by case and may be revoked. Scans are
        reviewed before publication, and the archive may decline or remove any
        submission at its discretion.
      </p>

      <h4>6. Removal</h4>
      <p>
        Contributions are intended to be permanent. Deleting an account removes
        the account and its annotations, and detaches the Archivist&rsquo;s name
        from their scans, which remain in the archive unattributed.
      </p>
      <p>
        Full removal of a scan may be requested in writing. Requests are
        reviewed individually. Removal is at the archive&rsquo;s discretion
        rather than guaranteed.
      </p>

      <h4>7. Changes</h4>
      <p>
        These terms may change. Material changes affecting contributors will be
        communicated to Archivists directly. The commitments in section 3 will
        not be weakened.
      </p>

      <h3>Privacy</h3>

      <p>
        The site runs no analytics. It uses no tracking pixels, no advertising,
        no third-party cookies, and no data brokers. Visitor activity is not
        profiled. Personal information is never sold, rented, or shared for
        marketing.
      </p>

      <h4>Data collected</h4>
      <p>
        Accounts store an email address, username, optional display name, and a
        password hash (scrypt, with a per-account salt). Plain passwords are
        never stored and cannot be recovered from the hash. Submissions store
        the scan together with the restroom&rsquo;s name, location, coordinates,
        description, and tags. Annotations store their text and position. IP
        addresses are retained for under one hour for rate limiting, then
        deleted automatically.
      </p>

      <h4>Public information</h4>
      <p>
        Usernames, display names, scans, and annotations are public. Email
        addresses are never displayed publicly and are used only for account
        verification, password resets, and replies to enquiries.
      </p>

      <h4>Third-party processors</h4>
      <p>
        <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a> hosts
        the site, database, scans, and thumbnails, and provides the anti-bot
        check on forms.
        <a href="https://www.useplunk.com/legal/privacy">Plunk</a> sends
        verification, password-reset, and contact emails, and therefore receives
        recipient addresses. On the map view, tiles load directly from
        <a href="https://carto.com/privacy/">CARTO</a> and
        <a href="https://www.esri.com/en-us/privacy/overview">Esri</a>, which
        receive visitor IP addresses and the map area requested. No other third
        party receives data.
      </p>

      <h4>Cookies</h4>
      <p>
        Two cookies are set, both strictly functional. One maintains the
        signed-in session. The other stores the preferred catalog view. Neither
        is used for tracking.
      </p>

      <h4>Scans and people</h4>
      <p>
        Archivists agree not to scan a restroom while other people are present,
        and all scans are reviewed before publication. Scans that capture
        identifying or private content are removed on report.
      </p>

      <h4>Access and deletion</h4>
      <p>
        Accounts can be deleted at any time from the Account page, which
        immediately removes the account and its annotations. Corrections,
        takedown requests, and questions about stored data can be sent through
        the contact form on the About page.
      </p>

      <p class="legal-updated">Last updated 1 September 2026.</p>
    </div>
  </dialog>
</template>

<style scoped>
.legal-dialog {
  width: min(680px, calc(100vw - 32px));
  max-height: min(80vh, 760px);
  padding: 0;
  border: 1px solid #000;
  background: #fff;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  /* The dialog is a top-layer element, so it sits outside .about-page and
     inherits none of its tokens. Everything it needs is restated here. */
  overflow: hidden;
}

/* Scoped to [open] deliberately. `display` must not be set on the bare
   selector: the UA stylesheet hides a closed dialog with
   `dialog:not([open]) { display: none }`, and an author rule setting display
   overrides that no matter how specific it is -- origin beats specificity --
   which leaves the dialog painted inline on the page at all times. */
.legal-dialog[open] {
  display: flex;
  flex-direction: column;
}

.legal-dialog::backdrop {
  background: rgb(0 0 0 / 0.35);
}

.legal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #ddd;
  flex: 0 0 auto;
}

.legal-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: #666;
}

.legal-close {
  border: none;
  background: none;
  padding: 0 4px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #000;
}

.legal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1 1 auto;
  line-height: 1.5;
}

.legal-body h3 {
  margin: 1.6em 0 0.6em;
  font-size: 14px;
  font-weight: 400;
  color: #666;
  border-bottom: 1px solid #ddd;
  padding-bottom: 4px;
}
.legal-body h3:first-child {
  margin-top: 0;
}

.legal-body h4 {
  margin: 1.2em 0 0.4em;
  font-size: 13px;
  font-weight: 700;
}

.legal-body p,
.legal-body li {
  font-size: 13px;
  margin: 0 0 0.9em;
}

.legal-body ul {
  margin: 0 0 0.9em;
  padding-left: 1.2em;
}
.legal-body li {
  margin-bottom: 0.4em;
}

.legal-body a {
  color: #000;
  text-decoration: underline;
}

.legal-updated {
  color: #666;
  margin-top: 1.6em;
}

/* A viewport media query, not `@container panel` like the rest of the About
   page uses. showModal() puts the dialog in the top layer, where its containing
   block is the viewport and ancestor layout is skipped -- so the `.panel`
   container can't be resolved and a container query here silently never
   matches. The dialog is sized off the viewport anyway, so this is the
   measurement that actually describes it. */
@media (max-width: 560px) {
  .legal-body p,
  .legal-body li {
    font-size: 12px;
  }
}
</style>
