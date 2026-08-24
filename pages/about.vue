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

// Running totals, read as the closing sentence of the bio — cheap server-side
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
  <div class="about-page">
    <CatalogHeader />

    <article class="about-content thin-scroll">
      <section>
        <h1>About</h1>
        <p>
          The Restroom Archive is an ongoing repository of publicly accessible
          restrooms. Everyone uses restrooms, yet as spaces, they are considered
          taboo, rarely discussed, acknowledged, or considered. Designed, and
          built by <a href="https://jakewelch.design">Jake Welch</a>, this
          archive aims to document the diverse qualities of these unique spaces.
          There is perhaps no space in society which better captures the
          creativity and impertinence of humans when they know that nobody else
          is watching. {{ statsSentence }}
        </p>
      </section>

      <section>
        <h1>Controls</h1>
        <p>Drag to rotate, right click to pan, and scroll to zoom.</p>
      </section>

      <section>
        <h1>Contact</h1>

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

/* Same panel-width step as the catalog and its header — the page scales with
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
