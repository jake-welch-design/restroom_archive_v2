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
          // 'wasm-unsafe-eval' is what lets the Draco decoder run. DRACOLoader
          // fetches the decoder, then compiles it as WebAssembly inside a
          // blob: Worker, and a blob: Worker inherits this document's policy --
          // so without it Chrome blocks the compile and a Draco-compressed scan
          // fails to open even though the loader is wired up correctly. It
          // permits compiling WebAssembly and nothing else; it does not bring
          // back 'unsafe-eval' for JavaScript.
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
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
    // No shared cache on `/`. What the homepage renders depends on the visitor:
    // the `viewMode` cookie picks list/grid/map, and the session decides whether
    // the header offers Login or Account. Cached, every visitor got the first
    // render — list, logged out — and a grid user's client then hydrated grid
    // markup onto list markup. Vue patched what it could and left the leftovers
    // loose in the panel, whose extra height let `scrollIntoView` scroll the
    // whole panel and carry the header and view controls off the top of the
    // screen. The response also re-sent that render's `Set-Cookie: viewMode=list`
    // to everyone, quietly overwriting the preference it was meant to remember.
    "/": { ssr: true },
    "/r/**": { ssr: true },
    "/about": { ssr: true },
    "/account": { ssr: true },
  },

  runtimeConfig: {
    turnstileSecretKey: "",
    plunkApiKey: "", // overridden by NUXT_PLUNK_API_KEY env var
    // Telegram bot token for admin notifications. Empty disables them.
    // Overridden by NUXT_TELEGRAM_BOT_TOKEN; read with useRuntimeConfig(event).
    telegramBotToken: "",
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
      // CARTO basemap tile key. Public by necessity: the browser requests the
      // tiles directly, so the key ships in the bundle. It's scoped to
      // basemap tiles only. Overridden by NUXT_PUBLIC_CARTO_API_KEY.
      cartoApiKey: "",
      turnstile: { siteKey: "0x4AAAAAADBTYNrRS1uRCrHi" },
    },
  },

  typescript: {
    strict: true,
  },

  app: {
    head: {
      // No default title here: app.vue's titleTemplate already supplies
      // "The Restroom Archive" as the bare title when a page sets none, and
      // a value here would be passed through that template a second time.
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
            "The Restroom Archive is an ongoing repository of publicly accessible restrooms.",
        },

        // Open Graph
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://restroomarchive.com" },
        { property: "og:title", content: "The Restroom Archive" },
        {
          property: "og:description",
          content:
            "The Restroom Archive is an ongoing repository of publicly accessible restrooms.",
        },
        {
          property: "og:image",
          content: "https://restroomarchive.com/metatag.jpg",
        },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "590" },
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
            "The Restroom Archive is an ongoing repository of publicly accessible restrooms.",
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
