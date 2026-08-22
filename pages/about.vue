<script setup lang="ts">
const { toAbsolute } = useAbsoluteUrl();

const siteUrl = "https://restroomarchive.com";
const description =
  "An on-going repository of public restrooms dedicated to documenting the humorous, chaotic, and often scary nature of these publicly accessible private spaces.";

useSeoMeta({
  title: "Info",
  description,
  ogTitle: "Info – The Restroom Archive",
  ogDescription: description,
  ogUrl: `${siteUrl}/about`,
  ogImage: toAbsolute("/metatag.jpg"),
  twitterTitle: "Info – The Restroom Archive",
  twitterDescription: description,
  twitterImage: toAbsolute("/metatag.jpg"),
});

useHead({
  link: [{ rel: "canonical", href: `${siteUrl}/about` }],
});

type InfoTab = "about" | "contact";

const TABS: { id: InfoTab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
];

const activeTab = ref<InfoTab>("about");

// Running totals shown in the row above the tabs, in the search bar's slot —
// cheap server-side counts, not derived from the (much larger) catalog list.
const { data: stats } = useStats();

// The tabs row is the band the layout's `.expand-tab` frames, so it grows to
// meet the tab rather than the tab measuring itself against a strip.
const pageEl = ref<HTMLElement | null>(null);
const alignEl = ref<HTMLElement | null>(null);
const alignStyle = useAlignToStrip(pageEl, alignEl);

// Contact form
const contactName = ref("");
const contactEmail = ref("");
const contactSubject = ref("");
const contactBody = ref("");
const contactTurnstileToken = ref("");
const contactLoading = ref(false);
const contactError = ref("");
const contactSubmitted = ref(false);

async function submitContact() {
  if (!contactTurnstileToken.value) {
    for (let i = 0; i < 20 && !contactTurnstileToken.value; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!contactTurnstileToken.value) {
      contactError.value =
        "Still verifying — please wait a moment and try again.";
      return;
    }
  }
  contactError.value = "";
  contactLoading.value = true;
  try {
    await $fetch("/api/contact", {
      method: "POST",
      body: {
        name: contactName.value,
        email: contactEmail.value,
        subject: contactSubject.value,
        body: contactBody.value,
        turnstileToken: contactTurnstileToken.value,
      },
    });
    contactSubmitted.value = true;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    contactError.value =
      err.data?.statusMessage ?? err.message ?? "Something went wrong.";
    contactTurnstileToken.value = "";
  } finally {
    contactLoading.value = false;
  }
}
</script>

<template>
  <div ref="pageEl" class="about-page" :style="alignStyle">
    <CatalogHeader />

    <div class="stats-row">
      <div class="stat-strip" aria-label="Site statistics">
        <span class="stat"
          ><span class="stat-label">Restrooms</span>:
          {{ stats.restrooms }}</span
        >
        <span class="stat"
          ><span class="stat-label">Cities</span>: {{ stats.cities }}</span
        >
        <span class="stat"
          ><span class="stat-label">Archivists</span>:
          {{ stats.archivists }}</span
        >
        <span class="stat"
          ><span class="stat-label">Annotations</span>:
          {{ stats.annotations }}</span
        >
      </div>
    </div>

    <nav ref="alignEl" class="info-tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="info-tab"
        role="tab"
        :class="{ active: activeTab === t.id }"
        :aria-selected="activeTab === t.id"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <article class="about-content">
      <!-- About -->
      <section v-if="activeTab === 'about'" role="tabpanel">
        <h1>About the archive</h1>
        <p>
          The Restroom Archive is an ongoing repository of publicly accessible
          restrooms. Everyone uses restrooms, yet as spaces, they are considered
          taboo, rarely discussed, acknowledged, or considered. Designed, and
          built by <a href="https://jakewelch.design">Jake Welch</a>, this
          archive aims to document the diverse qualities of these unique spaces.
          There is perhaps no space in our societies which better captures the
          creativity and impertinence of humans when they know that nobody else
          is watching.
        </p>
      </section>

      <!-- Contact -->
      <section v-else role="tabpanel">
        <div v-if="contactSubmitted" class="contact-msg">
          <p>Thanks — your message is on its way.</p>
          <p class="dim">
            We'll reply to {{ contactEmail }} if a reply is needed.
          </p>
        </div>

        <form v-else class="contact-form" @submit.prevent="submitContact">
          <p>Questions or feedback? Please feel free to reach out.</p>

          <label class="field">
            <span class="field-label">Name</span>
            <input
              v-model="contactName"
              type="text"
              required
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">Email</span>
            <input
              v-model="contactEmail"
              type="email"
              autocomplete="email"
              required
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">Subject</span>
            <input
              v-model="contactSubject"
              type="text"
              required
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">Message</span>
            <textarea
              v-model="contactBody"
              required
              rows="5"
              class="field-input field-textarea"
            />
          </label>

          <NuxtTurnstile
            v-model="contactTurnstileToken"
            class="turnstile"
            :options="{ theme: 'light', appearance: 'interaction-only' }"
          />

          <p v-if="contactError" class="form-error">{{ contactError }}</p>

          <button
            type="submit"
            class="primary-btn"
            :disabled="contactLoading || !contactTurnstileToken"
          >
            {{
              contactLoading
                ? "Sending…"
                : !contactTurnstileToken
                  ? "Verifying…"
                  : "Send"
            }}
          </button>
        </form>
      </section>

      <footer class="about-footer">
        <p>© 2026 Jake Welch. All rights reserved.</p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.about-page {
  /* One gutter for the page: the tabs row and the content below it have to
     share a left edge. */
  --gutter: 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  color: #000;
  overflow: hidden;
}

/* Stats row — sits directly under the site header, in the same band the
   catalog's `.controls` row occupies. The stat strip lands in the search
   bar's slot on the left. */
.stats-row {
  display: flex;
  align-items: center;
  padding: 6px var(--gutter);
  flex: 0 0 auto;
}

.stat-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 14px;
  /* Matches the content-box height of the catalog's search input (font +
     2px/2px padding + its 1px bottom border) so this text centers at the
     same vertical spot "Random"/"Filter" do in that row. */
  line-height: 21px;
  color: #000;
}
.stat-label {
  color: #666;
}

/* Tabs row — the band between the stats row and the one the expand tab ends
   on. Mirrors the catalog's `.sub-header` / `.thead` heading row that
   occupies the same position. */
.info-tabs {
  display: flex;
  /* Bottom-anchored, not centred in the band: the catalog fills the same band
     with two rows and its headings sit in the lower one, so matching that
     row's 10px bottom padding lands these on the same line. */
  align-items: flex-end;
  gap: 20px;
  padding: 10px var(--gutter);
  border-bottom: 1px solid #000;
  font-size: 14px;
  flex: 0 0 auto;
  /* Grows to end level with the expand tab — see useAlignToStrip. */
  box-sizing: border-box;
  min-height: var(--strip-align-height, 0px);
}

.info-tab {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #999;
  cursor: pointer;
}
.info-tab:hover:not(.active) {
  color: #595959;
}
.info-tab.active {
  color: #000;
}

.about-content {
  padding: 16px var(--gutter) var(--gutter);
  overflow-y: auto;
  flex: 1 1 auto;
  line-height: 1.5;
  /* Lets `.about-footer`'s `margin-top: auto` push it to the bottom of this
     box when content is short, while still scrolling normally once content
     overflows it. */
  display: flex;
  flex-direction: column;
}
.about-content p {
  font-size: 14px;
  margin: 0 0 1.2em;
}

.about-content a {
  color: #000;
  text-decoration: underline;
}

.about-content h1 {
  margin: 0 0 0.5em;
  /* padding-bottom: 8px; */
  /* border-bottom: 1px solid #000; */
  color: #666;
  font-size: 14px;
  font-weight: 400;
}

.about-content p:last-child {
  margin-bottom: 0;
}

/* Contact */
.contact-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 380px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  color: #666;
}
.field-input {
  border: 1px solid #000;
  padding: 4px 2px;
  font: inherit;
  font-size: 14px;
  background: transparent;
  outline: none;
  color: #000;
}
.field-textarea {
  resize: vertical;
  min-height: 90px;
  font-family: inherit;
}
.turnstile {
  margin: 4px 0;
}
.form-error {
  margin: 0;
  font-size: 14px;
  color: #c33;
}
.primary-btn {
  background: #000;
  color: #fff;
  border: 0;
  padding: 10px 24px;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  align-self: flex-start;
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary-btn:hover:not(:disabled) {
  background: #333;
}
.contact-msg p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
}
.dim {
  color: #999;
}

.about-footer {
  margin-top: auto;
  padding-top: 1.5em;
}

.about-footer p {
  font-size: 12px;
  color: #666;
  margin: 0;
  line-height: 1.4;
}

@media (max-width: 750px) {
  .about-page {
    --gutter: 12px;
    font-size: 12px;
  }
  .stats-row {
    padding: 6px var(--gutter);
  }
  .stat-strip {
    gap: 4px 14px;
    font-size: 12px;
    line-height: 19px;
  }
  .info-tabs {
    gap: 14px;
    padding: 6px var(--gutter);
    /* The tab moves to the panel's bottom edge here — nothing to align to. */
    min-height: 0;
  }
  .info-tab {
    font-size: 12px;
  }
  .about-content h1 {
    font-size: 14px;
  }
  .field-input {
    font-size: 12px;
  }
  .primary-btn {
    font-size: 14px;
    padding: 8px 18px;
  }

  .about-footer p {
    font-size: 10px;
  }
}
</style>
