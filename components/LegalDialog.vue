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
      <h2 id="legal-title">Terms &amp; Privacy</h2>
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

      <h4>1. What this is</h4>
      <p>
        The Restroom Archive is a curated archive of 3D scans of publicly
        accessible restrooms. Using the site means accepting these terms. If you
        submit a scan, the section on contributions applies to you as well.
      </p>

      <h4>2. Your scans stay yours</h4>
      <p>
        You keep the copyright in every scan you contribute. You are not signing
        it away, and you remain free to use your own scan anywhere else you
        like, for anything you like.
      </p>
      <p>
        What you grant the archive is an
        <strong>exclusive, perpetual, irrevocable, worldwide license</strong>
        to store, preserve, display, and present your scan as part of the
        archive, together with the right to make the technical copies and
        derivatives that hosting requires — thumbnails, compressed or optimised
        versions, format conversions. Exclusive means that for as long as the
        scan is in the archive, nobody else can be granted those rights.
      </p>
      <p>
        By submitting, you confirm the scan is yours to contribute, that you
        made it, and that you had the right to scan the space.
      </p>

      <h4>3. What the archive will never do with it</h4>
      <p>These are commitments, not preferences. The archive will not:</p>
      <ul>
        <li>Sell, rent, or otherwise commercialise your scan.</li>
        <li>
          Transfer or assign it to another party, including in an acquisition,
          without the same commitments carrying over intact.
        </li>
        <li>
          Sublicense or redistribute it — no dataset releases, no bulk exports,
          no partner feeds, no download button.
        </li>
        <li>
          Use it, or allow it to be used, as training, fine-tuning, evaluation,
          or grounding data for machine learning models of any kind.
        </li>
      </ul>
      <p>
        The scans exist to be looked at, here, in this archive. That is the
        whole of it.
      </p>

      <h4>4. What visitors may do</h4>
      <p>
        <strong>All rights reserved.</strong> Viewing and browsing the archive
        is welcome, as is linking to it, citing it, and writing about it. No
        license to reuse the scans is granted to anyone — not to visitors, not
        to search engines, not to AI companies. Downloading, extracting,
        redistributing, or building on the scan geometry all require written
        permission first.
      </p>
      <p>
        Use of anything in the archive as training data for machine learning is
        expressly prohibited and expressly reserved, including under Article
        4(3) of Directive (EU) 2019/790 and any equivalent text-and-data-mining
        provision elsewhere. This applies however a copy was obtained, including
        through a third-party crawl or a redistributed dataset.
      </p>

      <h4>5. Accounts</h4>
      <p>
        You are responsible for what happens under your account. Submission
        access is granted case by case and can be revoked. Scans are reviewed
        before publication, and the archive may decline or remove anything at
        its discretion.
      </p>

      <h4>6. Removal</h4>
      <p>
        Contributions are meant to be permanent — an archive that empties out
        isn't one. Deleting your account removes your account and your
        annotations, and detaches your name from your scans, which stay in the
        archive unattributed.
      </p>
      <p>
        That said, if you need a scan taken down entirely — it captured
        something private, your circumstances changed, you made a mistake — ask.
        Every good-faith request gets a real read and a real answer. Removal is
        at the archive's discretion rather than guaranteed, but the discretion
        is exercised in your favour where there's a genuine reason.
      </p>

      <h4>7. Changes</h4>
      <p>
        These terms may change. Material changes affecting contributors will be
        communicated to Archivists rather than quietly swapped in, and the
        commitments in section 3 will not be weakened.
      </p>

      <h3>Privacy</h3>

      <p>
        This site runs no analytics. There are no tracking pixels, no
        advertising, no third-party cookies, and no data brokers. Nothing you do
        here is profiled, and nothing about you is sold, rented, or shared for
        marketing — not now, and not as a change of heart later.
      </p>

      <h4>What's collected</h4>
      <p>
        An account stores your email, username, an optional display name, and a
        hashed password (scrypt, with a per-account salt — the plain password is
        never stored and cannot be recovered from the hash). Submitting stores
        the scan along with the restroom's name, location, coordinates, and any
        description or tags you add. Annotations store your text and where you
        placed it. Your IP address is held briefly — under an hour — purely to
        rate-limit abuse, then deleted automatically.
      </p>

      <h4>What's public</h4>
      <p>
        Your username, display name, scans, and annotations.
        <strong>Your email address is never shown publicly.</strong> It is used
        only to verify your account, reset your password, and reply if you get
        in touch.
      </p>

      <h4>Who else sees anything</h4>
      <p>
        Being exact matters more here than being reassuring. The site, database,
        scans, and thumbnails are hosted on
        <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a>,
        which also provides the anti-bot check on forms.
        <a href="https://www.useplunk.com/legal/privacy">Plunk</a> sends
        verification, password-reset, and contact emails, so it sees the address
        a message goes to. On the map view only, tiles load directly from
        <a href="https://carto.com/privacy/">CARTO</a> and
        <a href="https://www.esri.com/en-us/privacy/overview">Esri</a>, meaning
        those two can see your IP address and roughly which part of the map you
        are looking at. That is the complete list — there is no fifth party.
      </p>

      <h4>Cookies</h4>
      <p>
        Two, both strictly functional: one that keeps you signed in, and one
        that remembers whether you prefer the list, grid, or map view. Neither
        tracks you, and there are no third-party cookies to consent to.
      </p>

      <h4>Scans and people</h4>
      <p>
        Archivists agree never to scan a restroom while anyone else is present,
        and every scan is reviewed before publication. If a scan captures
        something it shouldn't, say so and it will be removed.
      </p>

      <h4>Your control</h4>
      <p>
        You can delete your account at any time from the Account page, which
        erases your account and annotations immediately. For anything else — a
        correction, a takedown, a question about what's stored — use the contact
        form on the About page.
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
