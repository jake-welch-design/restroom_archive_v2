# The Restroom Archive

An ongoing repository of public restrooms, documented as navigable 3D
photogrammetry and LiDAR scans. Each entry is a scanned room a visitor can
orbit, walk through in first person, and annotate in place.

Production: [restroomarchive.com](https://restroomarchive.com)

For how the pieces fit together, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

| Concern            | Choice                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Framework          | Nuxt 3, with the `cloudflare-pages` Nitro preset                                           |
| Hosting            | Cloudflare Pages                                                                           |
| Database           | Cloudflare D1 (SQLite), queried through Drizzle ORM                                        |
| Object storage     | Cloudflare R2, one bucket for scans and one for thumbnails                                 |
| Sessions & auth    | `nuxt-auth-utils` sealed cookie sessions (web) and hashed Bearer tokens (mobile)           |
| Bot defence        | Cloudflare Turnstile                                                                       |
| Email & newsletter | Plunk (transactional mail and the Weekly Report)                                           |
| Admin alerts       | Telegram Bot API                                                                           |
| 3D viewer & studio | Three.js (`GLTFLoader` + Draco), with MediaBunny and `gifenc` for MP4/GIF turntable export |
| Map                | MapLibre GL, with CARTO vector basemaps (light/dark) and Esri satellite imagery            |
| Search             | Client-side multi-field prefix/typo engine (`shared/utils/catalogSearch.ts`)               |

## Local setup

Requires Node `^20.19.0 || >=22.12.0` (declared in `package.json`), plus a
Cloudflare account with access to the project's D1 database and R2 buckets.

```sh
npm install
cp .env.example .env      # then fill in the values below
npm run db:migrate:local  # create the local D1 schema
npm run db:seed:local     # copy the production data into it (optional)
npm run dev               # http://localhost:3000
```

### Environment

`.env` drives local development; production uses Cloudflare Pages secrets and
variables instead. See `.env.example` for the full list.

| Variable                    | Purpose                                                                                                                                                            | Required locally |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `NUXT_SESSION_PASSWORD`     | 32+ character secret that seals the session cookie. Generate with `openssl rand -hex 32`.                                                                          | Yes              |
| `NUXT_TURNSTILE_SECRET_KEY` | Turnstile secret. Server verification is skipped when unset; set `NUXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` to auto-pass the client widget locally. | No               |
| `NUXT_PLUNK_API_KEY`        | Plunk API key for password-reset emails, contact messages, and the Weekly Report.                                                                                  | No               |
| `NUXT_TELEGRAM_BOT_TOKEN`   | Telegram bot token for admin queue notifications. Leaving it empty disables them.                                                                                  | No               |
| `NUXT_PUBLIC_SITE_URL`      | Origin used in emails, canonical links, and the sitemap.                                                                                                           | Yes              |
| `NUXT_PUBLIC_CARTO_API_KEY` | CARTO vector basemap key for MapView.                                                                                                                              | No               |

Local R2 is empty even after seeding the database, because `db:seed:local`
copies rows and not blobs. The catalog, account, and admin surfaces all work;
the 3D viewer will report `404: Model not found` until a scan is uploaded
locally or run with `npm run dev:remote`.

## Scripts

### Development

| Script                  | Use it when                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`           | Normal local development, against local D1 and R2.                                          |
| `npm run dev:remote`    | Local server, but bound to the **production** D1 and R2. Writes are real.                   |
| `npm run build`         | Produce the Pages bundle in `dist/`.                                                        |
| `npm run preview:pages` | Build, then serve through Wrangler, which is the closest local approximation of production. |

### Quality gates

All four should pass before anything is merged.

| Script                 | Checks                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `npm run typecheck`    | `vue-tsc --noEmit`. The bar is zero errors.                     |
| `npm run lint`         | ESLint. Correctness rules only; formatting belongs to Prettier. |
| `npm run format:check` | Prettier, in verify mode. `npm run format` writes.              |
| `npm run build`        | Catches anything only the production bundler sees.              |

### Database

| Script                      | Effect                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate:local`  | Apply pending SQL migrations in `server/db/migrations/` to local D1.                                          |
| `npm run db:migrate:remote` | Apply pending SQL migrations to **production** D1.                                                            |
| `npm run db:seed:local`     | Replace local D1 with an export of production. Destructive to local data only.                                |
| `npm run db:schema:dump`    | Print production's live schema, which is the authority. See the migrations note in the architecture document. |

### Maintenance

| Script                            | Effect                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `npm run thumbs -- --all`         | Re-render 800x800 catalog thumbnails for all published entries through Puppeteer. |
| `npm run thumbs -- --slug <slug>` | Render and upload the thumbnail for a single entry.                               |

## Deployment

```sh
npm run deploy
```

Builds and pushes to the `restroom-archive-v2` Pages project on the `main`
branch.

Configuration is split by sensitivity:

- **Secrets** are set with `wrangler pages secret put <NAME>` and never appear in
  the repository: `NUXT_SESSION_PASSWORD`, `NUXT_TURNSTILE_SECRET_KEY`,
  `NUXT_PLUNK_API_KEY`, `NUXT_TELEGRAM_BOT_TOKEN`, `NUXT_PUBLIC_CARTO_API_KEY`.
- **Public variables** live in `wrangler.toml` under `[vars]`, or in the Pages
  dashboard: `NUXT_PUBLIC_SITE_URL` (and optional `NUXT_PUBLIC_TURNSTILE_SITE_KEY`).
- **Bindings** live in `wrangler.toml`: the `DB` D1 database and the `MODELS`
  and `THUMBS` R2 buckets.

Rotating `NUXT_SESSION_PASSWORD` invalidates every existing web session, signing
all web users out.

## Repository layout

```
assets/css/      Global stylesheets: theme, a11y, scrollbars, forms, tabs, account, highlight
components/      Auto-imported, no path prefix (see nuxt.config.ts)
  account/       Profile, Submissions, Annotations, Archivist Guide, and admin/ beneath it
  catalog/       Browse surfaces: list, grid, map, version date picker, merge dialog, search highlight
  submit/        The submission wizard
  viewer/        The 3D viewer and its annotation layer
composables/     Client state, 3D scene/stage modules, and export helpers
docs/            ARCHITECTURE.md
layouts/         The persistent split shell
pages/           Routes (catalog, /r/[slug], about, account, auth, plus admin /studio and /newsletter)
public/          Static assets, favicons, guide media, vendored Draco WASM decoder, robots.txt, ai.txt
scripts/         Local DB seed, guide media encoding, and Puppeteer thumbnail renderer
server/
  api/           Endpoints, mirroring their URL paths (web, admin, R2 streams, and mobile)
  db/            Drizzle schema and hand-written SQL migrations
  middleware/    Session and mobile Bearer token resolution
  plugins/       Nitro session freshness hook
  routes/        sitemap.xml
  utils/         Server-only helpers
shared/utils/    Used by both halves; imported explicitly, not auto-imported
types/           Shared type declarations
```
