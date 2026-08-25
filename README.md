# The Restroom Archive

An ongoing repository of public restrooms, documented as navigable 3D
photogrammetry scans. Each entry is a scanned room a visitor can orbit, walk
through in first person, and annotate in place.

Production: [restroomarchive.com](https://restroomarchive.com)

For how the pieces fit together, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

| Concern             | Choice                                                     |
| ------------------- | ---------------------------------------------------------- |
| Framework           | Nuxt 3, with the `cloudflare-pages` Nitro preset           |
| Hosting             | Cloudflare Pages                                           |
| Database            | Cloudflare D1 (SQLite), queried through Drizzle ORM        |
| Object storage      | Cloudflare R2, one bucket for scans and one for thumbnails |
| Sessions            | `nuxt-auth-utils`, sealed cookie sessions                  |
| Bot defence         | Cloudflare Turnstile                                       |
| Transactional email | Plunk                                                      |
| 3D viewer           | Three.js, loading GLB through `GLTFLoader`                 |
| Map                 | MapLibre GL, with CARTO and Esri raster basemaps           |
| Search              | Fuse.js, client side over the loaded catalog               |

## Local setup

Requires Node `^20.19.0 || >=22.12.0`, which is Nuxt 3.34's own requirement and
is declared in `package.json`. Also a Cloudflare account with access to the
project's D1 database and R2 buckets.

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

| Variable                      | Purpose                                                                                                                            | Required locally |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `NUXT_SESSION_PASSWORD`       | 32+ character secret that seals the session cookie. Generate with `openssl rand -hex 32`.                                          | Yes              |
| `NUXT_TURNSTILE_SECRET_KEY`   | Turnstile secret. Verification is skipped entirely when this is unset, which is what makes local sign-up work without a challenge. | No               |
| `NUXT_PLUNK_API_KEY`          | Plunk API key. Password-reset and contact emails fail with a 500 without it.                                                       | No               |
| `NUXT_ADMIN_EMAIL`            | Where archivist-application notices are sent.                                                                                      | No               |
| `NUXT_PUBLIC_SITE_URL`        | Origin used in emails, canonical links and the sitemap.                                                                            | Yes              |
| `NUXT_PUBLIC_MODELS_BASE_URL` | Public R2 origin for scans. Left empty, models are streamed through `/api/r2/models` instead.                                      | No               |
| `NUXT_PUBLIC_THUMBS_BASE_URL` | The same for thumbnails.                                                                                                           | No               |

Local R2 is empty even after seeding the database, because `db:seed:local`
copies rows and not blobs. The catalog, account and admin surfaces all work; the
3D viewer will report `404: Model not found` until a scan is uploaded locally or
`NUXT_PUBLIC_MODELS_BASE_URL` is pointed at the real bucket.

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
| `npm run db:migrate:local`  | Apply pending migrations to local D1.                                                                         |
| `npm run db:migrate:remote` | Apply pending migrations to **production** D1.                                                                |
| `npm run db:seed:local`     | Replace local D1 with an export of production. Destructive to local data only.                                |
| `npm run db:schema:dump`    | Print production's live schema, which is the authority. See the migrations note in the architecture document. |
| `npm run db:generate`       | Drizzle-kit migration generation. Not the workflow this project uses; read that note first.                   |

### Maintenance

| Script           | Effect                                                                     |
| ---------------- | -------------------------------------------------------------------------- |
| `npm run thumbs` | Render missing catalog thumbnails by driving the viewer through Puppeteer. |

## Deployment

```sh
npm run deploy
```

Builds and pushes to the `restroom-archive-v2` Pages project on the `main`
branch.

Configuration is split by sensitivity:

- **Secrets** are set with `wrangler pages secret put <NAME>` and never appear in
  the repository: `NUXT_SESSION_PASSWORD`, `NUXT_TURNSTILE_SECRET_KEY`,
  `NUXT_PLUNK_API_KEY`, `NUXT_ADMIN_EMAIL`.
- **Public variables** live in `wrangler.toml` under `[vars]`, or in the Pages
  dashboard: the three `NUXT_PUBLIC_*` URLs.
- **Bindings** live in `wrangler.toml`: the `DB` D1 database and the `MODELS`
  and `THUMBS` R2 buckets.

Rotating `NUXT_SESSION_PASSWORD` invalidates every existing session, signing all
users out. That is the intended way to force a global sign-out.

## Repository layout

```
assets/css/      Global stylesheets: a11y, scrollbars, forms, tabs, account
components/      Auto-imported, no path prefix (see nuxt.config.ts)
  account/       The account page's tabs, and admin/ beneath it
  catalog/       Browse surfaces: list, grid, map, and the shared pieces
  submit/        The submission wizard
  viewer/        The 3D viewer and its annotation layer
composables/     Auto-imported client state and behaviour
docs/            ARCHITECTURE.md
layouts/         The single persistent shell
pages/           Routes
server/
  api/           Endpoints, mirroring their URL paths
  db/            Drizzle schema and SQL migrations
  middleware/    Runs on every request
  plugins/       Nitro hooks
  utils/         Server-only helpers
shared/utils/    Used by both halves; imported explicitly, not auto-imported
types/           Shared type declarations
```
