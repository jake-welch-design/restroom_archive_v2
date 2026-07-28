<script setup lang="ts">
const { toAbsolute } = useAbsoluteUrl();

const siteUrl = "https://restroomarchive.com";
const description =
  "An on-going repository of public restrooms dedicated to documenting the humorous, chaotic, and often scary nature of these publicly accessible private spaces.";

useSeoMeta({
  title: "About",
  description,
  ogTitle: "About – The Restroom Archive",
  ogDescription: description,
  ogUrl: `${siteUrl}/about`,
  ogImage: toAbsolute("/metatag.jpg"),
  twitterTitle: "About – The Restroom Archive",
  twitterDescription: description,
  twitterImage: toAbsolute("/metatag.jpg"),
});

useHead({
  link: [{ rel: "canonical", href: `${siteUrl}/about` }],
});

// This page has no controls strip of its own, so the layout's `.expand-tab`
// frames `CatalogHeader` instead — see useHeaderStripGeom.
const pageEl = ref<HTMLElement | null>(null);
useHeaderStripGeom(pageEl);
</script>

<template>
  <div ref="pageEl" class="about-page">
    <CatalogHeader />
    <article class="about-content">
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
        bars, coffee shops, and other establishments across the U.S. and Europe.
        The scans are intended to document the diverse nature of these uniquely
        private, publicly accessible spaces. By documenting their
        characteristics, atmosphere, decor, and artifacts left behind by
        visitors, Jake hopes to reveal how public restrooms reflect the
        creativity and impertinence of humans when they know no one is watching.
      </p>

      <p>
        Scans were made with LiDAR using Polycam for iPhone. This site was built
        with Nuxt, Three.js, and TypeScript, and is deployed to Cloudflare
        Pages.
      </p>

      <p>
        If you have any feedback or questions, please reach out to Jake at
        <a href="mailto:hello@restroomarchive.com">hello@restroomarchive.com</a>
      </p>

      <!-- <h2>Stats</h2>
      <p>Restrooms scanned:</p>
      <p>Largest restroom:</p>
      <p>Smallest restroom:</p>
      <p>Reminder signs:</p>
      <p>Squares of toilet paper on the floor:</p> -->

      <footer class="about-footer">
        <p>© 2026 Jake Welch. All rights reserved.</p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.about-page {
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
  padding: 24px;
  overflow-y: auto;
  flex: 1 1 auto;
  line-height: 1.5;
}
.about-content p {
  margin: 0 0 1.2em;
}

.about-content a {
  color: #000;
  text-decoration: underline;
}

.about-content h1 {
  font-size: 18px;
  font-weight: 400;
  border-bottom: 1px solid #000;
}

.about-content p:last-child {
  margin-bottom: 0;
}

.about-footer {
  margin-top: 3em;
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
    font-size: 12px;
  }
  .about-content {
    padding: 12px;
  }

  .about-content h1 {
    font-size: 14px;
  }

  .about-footer p {
    font-size: 10px;
  }
}
</style>
