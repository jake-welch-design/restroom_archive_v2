export default defineNuxtConfig({
  compatibilityDate: "2025-04-01",
  devtools: { enabled: true },

  modules: ["nuxt-auth-utils", "@nuxtjs/turnstile", "@nuxt/eslint"],

  css: [
    "maplibre-gl/dist/maplibre-gl.css",
    "~/assets/css/a11y.css",
    "~/assets/css/scrollbars.css",
    "~/assets/css/forms.css",
    "~/assets/css/tabs.css",
    "~/assets/css/account.css",
  ],

  nitro: {
    preset: "cloudflare-pages",
    modules: ["nitro-cloudflare-dev"],
  },

  components: [{ path: "~/components", pathPrefix: false }],

  routeRules: {
    "/**": {
      headers: {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy":
          "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        "Strict-Transport-Security":
          "max-age=63072000; includeSubDomains; preload",
        "Content-Security-Policy": [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self' https: blob:",
          "worker-src 'self' blob:",
          "frame-src https://challenges.cloudflare.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    },
    "/": { swr: 60 },
    "/r/**": { ssr: true },
    "/about": { ssr: true },
    "/account": { ssr: true },
  },

  runtimeConfig: {
    turnstileSecretKey: "",
    plunkApiKey: "", // overridden by NUXT_PLUNK_API_KEY env var
    session: {
      password: "", // overridden by NUXT_SESSION_PASSWORD env var
      maxAge: 60 * 60 * 24 * 30, // 30 days
      cookie: {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: true,
      },
    },
    public: {
      modelsBaseUrl: "",
      thumbsBaseUrl: "",
      siteUrl: "",
      turnstile: { siteKey: "0x4AAAAAADBTYNrRS1uRCrHi" },
    },
  },

  typescript: {
    strict: true,
  },

  app: {
    head: {
      title: "The Restroom Archive",

      viewport: "width=device-width, initial-scale=1",

      link: [
        {
          rel: "icon",
          type: "image/png",
          href: "/favicon/favicon-96x96.png",
          sizes: "96x96",
        },
        { rel: "icon", type: "image/svg+xml", href: "/favicon/favicon.svg" },
        { rel: "shortcut icon", href: "/favicon/favicon.ico" },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/favicon/apple-touch-icon.png",
        },
        { rel: "manifest", href: "/favicon/site.webmanifest" },
      ],

      meta: [
        { charset: "utf-8" },

        {
          name: "description",
          content:
            "An on-going repository of public restrooms dedicated to documenting the humorous, chaotic, and often scary nature of these publicly accessible private spaces.",
        },

        // Open Graph
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://restroomarchive.com" },
        { property: "og:title", content: "The Restroom Archive" },
        {
          property: "og:description",
          content:
            "An on-going repository of public restrooms dedicated to documenting the humorous, chaotic, and often scary nature of these publicly accessible private spaces.",
        },
        {
          property: "og:image",
          content: "https://restroomarchive.com/metatag.jpg",
        },
        {
          property: "og:image:alt",
          content: "Preview of The Restroom Archive",
        },
        { property: "og:site_name", content: "The Restroom Archive" },

        // Twitter (X)
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:url", content: "https://restroomarchive.com" },
        { name: "twitter:title", content: "The Restroom Archive" },
        {
          name: "twitter:description",
          content:
            "An on-going repository of public restrooms dedicated to documenting the humorous, chaotic, and often scary nature of these publicly accessible private spaces.",
        },
        {
          name: "twitter:image",
          content: "https://restroomarchive.com/metatag.jpg",
        },

        { name: "apple-mobile-web-app-title", content: "The Restroom Archive" },
      ],
    },
  },
});
