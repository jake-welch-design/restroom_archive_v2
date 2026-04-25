// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-04-01",
  devtools: { enabled: true },

  modules: ["nuxt-auth-utils", "@nuxtjs/turnstile"],

  css: ["maplibre-gl/dist/maplibre-gl.css"],

  nitro: {
    preset: "cloudflare-pages",
    modules: ["nitro-cloudflare-dev"],
  },

  components: [{ path: "~/components", pathPrefix: false }],

  routeRules: {
    "/": { swr: 60 },
    "/r/**": { ssr: true },
    "/about": { ssr: true },
    "/account": { ssr: true },
  },

  runtimeConfig: {
    // NUXT_TURNSTILE_SECRET_KEY env var overrides at runtime
    turnstileSecretKey: "",
    public: {
      modelsBaseUrl: "",
      thumbsBaseUrl: "",
      siteUrl: "",
      // Dev key always passes; override via NUXT_PUBLIC_TURNSTILE_SITE_KEY in prod
      turnstile: { siteKey: "0x4AAAAAADBTYNrRS1uRCrHi" },
    },
  },

  typescript: {
    strict: true,
  },

  app: {
    head: {
      viewport:
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
    },
  },
});
