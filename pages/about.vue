<template>
  <div class="about-page">
    <DirectoryHeader />
    <article class="about-content">
      <p>
        The Restroom Archive is a an on-going repository of public restrooms.
        What started as a joke in 2023 has become a years-long practice of 3D
        scanning the restrooms in restaurants, gas stations, convenience stores,
        coffee shops, and various other spaces across the U.S. and Europe. The
        scans are meant to document the humorous, chaotic, and often scary
        nature of these uniquely private publicly accessible spaces. Through
        capturing their diverse decor, graffiti, and artifacts, both stored and
        left behind, I hope to reveal public restrooms as a reflection of both
        the creativity and impertinence of humanity when we know nobody else is
        watching.
      </p>

      <p>
        Scans are made with LiDAR using Polycam for iPhone. This site was built
        using Vue.js and Three.js and is currently hosted on Cloudflare pages.
      </p>

      <p>
        For any feedback or questions please feel free to reach out through my
        website or my Instagram. Thanks for visiting!
      </p>

      <p>Jake</p>
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
}
</style>
