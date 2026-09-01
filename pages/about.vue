<script setup lang="ts">
import { apiErrorMessage } from "~~/shared/utils/apiError";
import { waitForTurnstileToken } from "~/composables/useTurnstileToken";
const { toAbsolute } = useAbsoluteUrl();

const siteUrl = "https://restroomarchive.com";
const description =
  "The Restroom Archive is an ongoing repository of publicly accessible restrooms.";

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

// Running totals, read as the closing sentence of the bio. Cheap server-side
// counts, not derived from the (much larger) catalog list. Built as a string so
// the counts agree with their nouns: the archivist count is still low enough
// that "1 archivists" is a real case, not a hypothetical.
const { data: stats } = useStats();

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const statsSentence = computed(() => {
  const s = stats.value;
  const verb = s.restrooms === 1 ? "has" : "have";
  return (
    `Currently, ${plural(s.restrooms, "restroom", "restrooms")} ${verb} been ` +
    `archived in ${plural(s.cities, "city", "cities")} by ` +
    `${plural(s.archivists, "archivist", "archivists")}.`
  );
});

// Terms and privacy live in a modal rather than inline: the full text is long
// enough to bury the contact form, and the footer link is where people go
// looking for it.
const legalOpen = ref(false);

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
  if (!(await waitForTurnstileToken(contactTurnstileToken))) {
    contactError.value = "Still verifying. Please wait a moment and try again.";
    return;
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
    contactError.value = apiErrorMessage(e, "Something went wrong.");
    contactTurnstileToken.value = "";
  } finally {
    contactLoading.value = false;
  }
}
</script>

<template>
  <div class="about-page">
    <CatalogHeader />

    <article class="about-content thin-scroll">
      <section>
        <h1>About</h1>
        <p>
          The Restroom Archive is an ongoing repository of publicly accessible
          restrooms. Everyone uses restrooms, yet as spaces, they are considered
          taboo, rarely discussed, acknowledged, or considered. Designed and
          built by <a href="https://jakewelch.design">Jake Welch</a>, this
          archive aims to document the diverse qualities of these unique spaces.
          There is perhaps no space in society which better captures the
          creativity and impertinence of humans when they know that nobody else
          is watching. {{ statsSentence }}
        </p>
      </section>

      <section>
        <h1>Navigation controls</h1>
        <p>Drag to rotate, right click to pan, and scroll to zoom.</p>
      </section>

      <section>
        <h1>How to scan a restroom</h1>
        <p>
          For this project I've primarily used
          <a
            href="https://apps.apple.com/us/app/polycam-3d-scans-floor-plans/id1532482376"
            >Polycam for iPhone</a
          >, but any mobile 3D scanning app should work. iPhone Pro models
          support LiDAR scanning, which I recommend, but if you don't have
          access to LiDAR, you should be able to make quality scans using
          photogrammetry. Click
          <a
            href="https://learn.poly.cam/hc/en-us/articles/36655587097620-How-to-Use-Space-Mode-with-LiDAR-enabled-devices#h_01K3P12AHC1PG459TBPJN6H7Y9"
            >here</a
          >
          to learn how to scan with LiDAR, and
          <a
            href="https://learn.poly.cam/hc/en-us/articles/43933482446996-How-to-Use-Space-Mode-Non-LiDAR-Devices#h_05_scanning"
            >here</a
          >
          to learn how to scan with photogrammetry.
          <br /><br />Download the model as a .GLB/.GLTF file, Polycam offers
          export in this format for free. To become an Archivist and submit your
          scan, please sign-up for an account and request access on the Account
          page.
        </p>
      </section>

      <section>
        <h1>Contact</h1>

        <div v-if="contactSubmitted" class="contact-msg">
          <p>Thanks, your message is on its way.</p>
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
        <p>© 2026 Jake Welch</p>
        <p class="dim">
          <a href="#" @click.prevent="legalOpen = true"
            >Privacy and Usage Statement</a
          >
        </p>
      </footer>
    </article>

    <LegalDialog :open="legalOpen" @close="legalOpen = false" />
  </div>
</template>

<style scoped>
/* Prose scale, a step above the account page. Retunes the shared form tokens
   rather than restating the rules they drive. */
.about-page {
  --field-input-padding: 4px 2px;
  --primary-btn-padding: 10px 24px;
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
  color: #666;
  font-size: 14px;
  font-weight: 400;
}

/* Sections stack with the same rhythm the paragraphs set, split by the light
   divider the account tab and catalog rows use. No margin on top of the
   padding: the previous paragraph's own 1.2em bottom margin already sits
   above the rule, so this keeps the same space on either side of it. */
.about-content section + section {
  padding-top: 1.2em;
  border-top: 1px solid #e8e8e8;
}

.about-content section:last-of-type p:last-child {
  margin-bottom: 0;
}

/* Contact */
.contact-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 380px;
}
.contact-form p {
  margin: 0;
}
/* Taller than the shared default: the contact message is expected to run to
   a paragraph, not a line. */
.field-textarea {
  min-height: 90px;
}
.contact-msg p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
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

/* Same panel-width step as the catalog and its header. The page scales with
   the panel it sits in, not with the window. */
@container panel (max-width: 560px) {
  .about-page {
    --gutter: 12px;
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
