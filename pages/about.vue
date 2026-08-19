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

type InfoTab = "about" | "stats" | "contact" | "colophon";

const TABS: { id: InfoTab; label: string }[] = [
  { id: "about", label: "About" },
  // { id: "stats", label: "Stats" },
  { id: "contact", label: "Contact" },
  { id: "colophon", label: "Colophon" },
];

const activeTab = ref<InfoTab>("about");

// Stats read the same catalog list the index page does — shared `useFetch` key,
// so arriving from the catalog costs nothing extra.
const { data: restrooms } = useRestrooms();

// Admins get pending entries in the list so /r/<slug> can resolve them; they
// shouldn't be counted here.
const published = computed(() =>
  (restrooms.value ?? []).filter((r) => r.status !== "pending"),
);

function formatDisplayDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

const stats = computed(() => {
  const list = published.value;
  const dates = list
    .map((r) => r.isoDate)
    .filter(Boolean)
    .sort();
  return [
    { label: "Restrooms scanned", value: String(list.length) },
    {
      label: "Locations",
      value: String(new Set(list.map((r) => r.location).filter(Boolean)).size),
    },
    { label: "First scan", value: formatDisplayDate(dates[0] ?? "") },
    {
      label: "Latest scan",
      value: formatDisplayDate(dates[dates.length - 1] ?? ""),
    },
  ].filter((s) => s.value);
});

// The tabs row is the band the layout's `.expand-tab` frames, so it grows to
// meet the tab rather than the tab measuring itself against a strip.
const pageEl = ref<HTMLElement | null>(null);
const alignEl = ref<HTMLElement | null>(null);
const alignStyle = useAlignToStrip(pageEl, alignEl);
</script>

<template>
  <div ref="pageEl" class="about-page" :style="alignStyle">
    <CatalogHeader />

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
        <h1>What is The Restroom Archive?</h1>
        <p>
          The Restroom Archive is an ongoing repository of 3D scans of restrooms
          designed, built, and maintained by
          <a
            href="https://jakewelch.design"
            target="_blank"
            rel="noopener noreferrer"
            >Jake Welch</a
          >. What began as a joke in 2023 has become a years-long practice of 3D
          scanning restrooms in restaurants, gas stations, convenience stores,
          bars, coffee shops, and other establishments across the U.S. and
          Europe. The scans are intended to document the diverse nature of these
          uniquely private, publicly accessible spaces. By documenting their
          characteristics, atmosphere, decor, and artifacts left behind by
          visitors, Jake hopes to reveal how public restrooms reflect the
          creativity and impertinence of humans when they know no one is
          watching.
        </p>
        <h1>Why does this exist?</h1>
      </section>

      <!-- Stats -->
      <section v-else-if="activeTab === 'stats'" role="tabpanel">
        <dl class="stat-list">
          <template v-for="s in stats" :key="s.label">
            <dt>{{ s.label }}</dt>
            <dd>{{ s.value }}</dd>
          </template>
        </dl>
      </section>

      <!-- Contact -->
      <section v-else-if="activeTab === 'contact'" role="tabpanel">
        <p>
          If you have any feedback or questions, please reach out to Jake at
          <a href="mailto:hello@restroomarchive.com"
            >hello@restroomarchive.com</a
          >
        </p>
      </section>

      <!-- Colophon -->
      <section v-else role="tabpanel">
        <p>
          Scans were made with LiDAR using Polycam for iPhone. This site was
          built with Nuxt, Three.js, and TypeScript, and is deployed to
          Cloudflare Pages.
        </p>
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

/* Tabs row — the band between the site header's border and the one the expand
   tab ends on. Mirrors the catalog's `.sub-header` / `.thead` heading row that
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

/* Stats */
.stat-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  margin: 0;
}
.stat-list dt {
  color: #666;
}
.stat-list dd {
  margin: 0;
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

  .about-footer p {
    font-size: 10px;
  }
}
</style>
