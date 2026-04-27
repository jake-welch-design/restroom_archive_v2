<template>
  <div class="about-page">
    <DirectoryHeader />
    <article class="about-content">
      <h2>What is The Restroom Archive?</h2>
      <p>
        The Restroom Archive is an ongoing repository of 3D scans of restrooms
        designed, built, and maintained by
        <a href="https://jakewelch.design" target="_blank">Jake Welch</a>. What
        began as a joke in 2023 has become a years-long practice of 3D scanning
        restrooms in restaurants, gas stations, convenience stores, bars, coffee
        shops, and other establishments across the U.S. and Europe. The scans
        are intended to document the diverse nature of these uniquely private,
        publicly accessible spaces. By documenting their characteristics,
        atmosphere, decor, and artifacts left behind by visitors, Jake hopes to
        reveal how public restrooms reflect the creativity and impertinence of
        humans when they know no one is watching.
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

      <h2>License</h2>
      <p>
        All 3D models and associated media on this site are licensed under
        Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
        (CC BY-NC-SA 4.0). This means you are free to share and adapt the
        material for non-commercial purposes, as long as you give appropriate
        credit and distribute your contributions under the same license.
      </p>
      <p>
        For more details, please see the full license text at
        <a
          href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
          target="_blank"
          >https://creativecommons.org/licenses/by-nc-sa/4.0/</a
        >.
      </p>
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

.about-content h2 {
  font-size: 18px;
  font-weight: 400;
  border-bottom: 1px solid #000;
}

.about-content p:last-child {
  margin-bottom: 0;
}

@media (max-width: 750px) {
  .about-page {
    font-size: 12px;
  }
  .about-content {
    padding: 12px;
  }

  .about-content h2 {
    font-size: 14px;
  }
}
</style>
