# Architecture

How The Restroom Archive is put together, and why the less obvious parts are the
way they are. For setup and scripts, see the [README](../README.md).

---

## 1. The layout model

Every public and account route renders inside one persistent shell,
`layouts/default.vue`, holding two panes side by side:

```
┌──────────────────────────┬───────────────────────────────┐
│                          │                               │
│   .panel                 │   .viewer-panel               │
│   <slot /> = the page    │   <Viewer> (never unmounts)   │
│                          │                               │
│   catalog / account /    │   the 3D scan for whatever    │
│   about / password pages │   is currently selected       │
│                          │                               │
└──────────────────────────┴───────────────────────────────┘
                          ▲
                   .expand-tab collapses the panel
```

Only two admin tools opt out with `definePageMeta({ layout: false })`:
`pages/studio.vue` (`/studio`, the turntable MP4/GIF exporter) and
`pages/newsletter.vue` (`/newsletter`, the Weekly Report composer), each needing
a full-viewport workspace with its own preview pane. `app.vue` also mounts
`<WeeklyReportDialog />` alongside `<NuxtLayout>` for the first-visit signup
prompt.

**The viewer lives in the layout, not in a page.** Everything below follows from
that choice:

- Loading a photogrammetry or LiDAR GLB is expensive. Mounting the viewer per
  route would re-download and re-parse the scan on every navigation.
- WebGL context creation and teardown is not free either, and browsers cap how
  many live contexts a page may have.
- The submission wizard previews an unsaved local scan in the same surface the
  archive uses. Because the viewer is layout-level, the wizard can take it over
  by writing a blob URL to shared state (§3).

Navigation between layout routes never disturbs the viewer. Selecting a restroom
changes a shared ref; the viewer swaps its model and disposes the old one's GPU
resources.

### The mobile sheet

Below 750px the two panes stack: the catalog becomes a top-anchored sheet whose
height is a fraction of the viewport, and `.expand-tab` becomes its grabber.

Two CSS variables published by the layout script drive it:

- `--panel-frac`: the sheet's height as a fraction of the viewport.
- `--push-frac`: how far the viewer is pushed down.

`--push-frac` stops at the sheet's resting height (0.55) while `--panel-frac`
keeps going. Past that point the sheet slides _over_ the viewer rather than
squeezing it, so the default view matches the un-dragged layout and the viewer
is not re-laid-out on every drag frame.

The drag's upper bound is measured off the live controls via `maxSheetFrac`:
when the viewer's control menu is folded it clears `.ctrl-more`, and when the
menu opens (`useViewerControls`) the sheet eases back down to clear
`.overlay-right`. Opening the admin crop tool on mobile closes the sheet
completely (`sheetClosedForCrop`) so the crop gizmo gets the whole viewport, and
restores the sheet afterward unless the user reopened it manually.

---

## 2. Strip geometry

The `.expand-tab` that collapses the catalog panel lines up with the panel's
header strip: starting just under the controls row's top border and ending level
with the sub-header's bottom border. Hand-tuned pixel constants drift across
platforms and font swaps, so the geometry is measured and published instead:

```
Catalog (has a controls strip)          Account (no strip)
────────────────────────────────        ──────────────────────────────
Catalog.vue measures its own DOM        useAlignToStrip reads stripGeom
        │                                        │
        ▼                                        ▼
  useStripGeom  ◄──────────────────────  the tab stays where it is
   { top, height }                        and the page's first
        │                                 bordered row grows to
        ▼                                 reach it, via
  layout binds --tab-top                  min-height:
  and --tab-height                        var(--strip-align-height)
```

Details worth knowing before changing any of it:

- `measureStrip` **sums** the two strip rows rather than spanning from the first
  one's top to the last one's bottom. The filter panel opens _between_ them, and
  a span would swallow it and stretch the tab.
- `useAlignToStrip` uses `min-height`, not `height`, so content taller than the
  strip keeps its natural height rather than being clipped.
- Both re-measure on `document.fonts.ready` to catch web-font swaps.
- Both observe the target element as well as the root.
- On the mobile sheet the tab moves to the panel's bottom edge, so both sides
  drop the alignment variable below 750px.

---

## 3. State and data flow

### Shared singletons (`useState` / `useCookie`)

One instance per request, shared by every caller:

| Composable                                   | Holds                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `useSelection`                               | Which restroom and annotation are selected                                         |
| `useCatalogRows`                             | The filtered, sorted rows, so the viewer's next/previous match what the list shows |
| `useStripGeom`                               | The measured header strip (§2)                                                     |
| `useSubmissionPreview`                       | The wizard's or admin queue's viewer takeover                                      |
| `useAccountNav`                              | Account tab, submissions sub-tab, admin group, and remembered section per group    |
| `useViewerControls`                          | Viewer control menu open state, column height, and active crop state               |
| `useTheme`                                   | Light / dark / system display preference (`theme` cookie + `data-theme` on `html`) |
| `useRestrooms`, `useStats`, `useAnnotations` | Keyed `useFetch` results (`deep: false` on read-only lists)                        |

### Per-caller helpers and shared modules

Fresh state each call: `useAsyncAction`, `useAdminAction`, `useTurnstileToken`,
`useThreeScene`, `useAlignToStrip`, `useTagFilter`, `useListControls`.
`useAsyncAction` and `useAdminAction` return `reactive(...)` so templates read
`action.loading` without `.value`.

Plain modules in `composables/` shared by explicit import: `scanModel.ts` (GLB +
Draco loading, unlit materials, bounds, disposal), `cropGizmo.ts` (lazy-loaded
admin crop/level gizmo), `turntableStage.ts` and `studioExport.ts` (`/studio`
turntable rendering and MediaBunny/`gifenc` encoding), and `emailImage.ts`
(image compression for newsletter uploads).

### Keyed fetches

Every list on the account page is read twice (counted for a badge and rendered
in a section). `composables/useAccountData.ts` declares them with explicit keys
and `server: false`, `immediate: false`, `deep: false`, `default: () => []`.

### The empty-URL trap

An empty URL in `useFetch(() => slug.value ? ... : "")` resolves relative to the
current page and fetches its HTML instead of skipping the request.
`useAnnotations` sets `watch: false` and drives `execute()` from its own
watcher, clearing the array when `slug` goes falsy.

### Viewer takeover

`useSubmissionPreview` exposes three refs:

- `previewModelUrl`: what the viewer should load (set by the wizard or the admin
  pending queue; non-null also hides the panel collapse tab).
- `hasUnsavedSubmission`: true only while the wizard holds unsaved progress,
  gating navigation confirmation.
- `previewEntry`: id, slug, and crop when previewing a real database entry in
  the admin queue, enabling the crop tool during review.

### The admin tab's two nav rows

`composables/useAccountNav.ts` declares the groups and their sections (with
actionable queues placed first so each group opens on its backlog):

| Group         | Sections                                      |
| ------------- | --------------------------------------------- |
| `submissions` | Pending, Archived, Rejected, Removal requests |
| `accounts`    | Upgrades, Directory                           |
| `annotations` | All annotations, Reports                      |
| `audit`       | (single list, so no second row renders)       |

**Navigation inside the app must use `NuxtLink`, never a bare `href`.** A plain
anchor triggers a full page load, dropping every `useState` singleton and
tearing down the persistent WebGL viewer.

### Search and list controls

Public catalog search (`shared/utils/catalogSearch.ts`) tokenizes across name,
location, full country/subdivision names, description, tags, submitter, and
date, preserving the user's chosen sort order within equal match tiers and
falling back to bounded typo tolerance only when a word has no exact or prefix
match. Matched spans are highlighted via `SearchHighlight.vue`.

Admin lists use `AdminListControls` and `useListControls` for substring
filtering while keeping the chosen sort key in force.

---

## 4. The viewer and studio

`composables/scanModel.ts` owns the scan pipeline shared by both the live viewer
(`composables/useThreeScene.ts` + `Viewer.client.vue`) and the admin video
studio (`composables/turntableStage.ts` + `pages/studio.vue`).

### Camera modes and projection

- **Orbit**: `OrbitControls`, 70° perspective FOV by default, with an
  **Orthographic** toggle in the viewer controls. Auto-rotates slowly until the
  first interaction.
- **POV**: camera at eye height inside the scan (`povX`, `povY`, `povZ` when
  configured on the crop, or just above the frame's centre), drag to look
  around, wheel and pinch adjust FOV between 30° and 110°. Entering POV or the
  crop tool switches orthographic views back to perspective automatically.

### Draco compression

`getDracoLoader` in `composables/scanModel.ts` attaches a single shared
`DRACOLoader` pointing at `/draco/` (`draco_wasm_wrapper.js` and
`draco_decoder.wasm`, vendored from
`node_modules/three/examples/jsm/libs/draco/gltf/`). Keeping the decoder in
`public/draco/` serves it same-origin from static assets without a third-party
CSP exception; `'wasm-unsafe-eval'` in `nuxt.config.ts` allows compiling the
WASM module inside `DRACOLoader`'s `blob:` worker.

When upgrading `three` in `package.json`, re-copy both files from
`node_modules/three/examples/jsm/libs/draco/gltf/` into `public/draco/` (listed
in `.prettierignore` so Prettier never reformats the minified wrapper) and
update the pinned `three@` CDN URL in `scripts/render-thumbs.ts`.

### Unlit materials and GPU disposal

Photogrammetry and LiDAR scans bake real-world lighting into their base colour
textures. `scanModel.ts` converts materials to unlit `MeshBasicMaterial` with
`NoToneMapping`, transferring textures and disposing old material shells. On
model swap or unmount, `disposeObject` disposes geometries, materials, and every
attached texture so GPU memory does not accumulate across browsing sessions.

### Orbit pivot re-anchoring

`reanchorOrbitTarget` raycasts along the camera's forward axis (throttled and
guarded by an early-out when the orbit radius is already large) and moves
`controls.target` onto the visible surface so zooming past a room's midpoint
never collapses dolly and pan speeds.

### Annotations

Annotations store a 3D point in levelled model-local space plus the camera
snapshot that framed it. `AnnotationsLayer.vue` projects visible markers in a
`requestAnimationFrame` loop using a `shallowRef` map and dirty-checking so
stationary cameras trigger zero Vue re-renders.

### Multi-round cropping, levelling, and POV placement

Admins can level tilted scans, trim stray geometry across multiple rounds, and
position the POV eye without modifying the `.glb` in R2. `cropGizmo.ts` is
dynamically imported the first time an admin opens the crop tool so public
visitors do not download or instantiate the gizmo.

- **Two boxes plus additional removals**: `box` (`keep` or `remove`) is cut by
  six Three.js clipping planes; `frame` is the surviving geometry bounds used to
  centre and frame the scan; `removed` (`CropBox[]`, up to `MAX_CROP_REMOVALS`)
  holds additional confirmed removal boxes cut in the fragment shader via custom
  GLSL spliced through `onBeforeCompile` (`shared/utils/cropShader.ts`, shared
  with `scripts/render-thumbs.ts`).
- **Levelling**: wraps the GLB scene in a level node (`L = R · (q - p) + p`)
  beneath the centred wrapper group. Saving a crop or level change rewrites all
  stored annotations for that entry on the server (`shared/utils/levelling.ts`)
  in a single D1 batch and re-renders the thumbnail (`?v=` keyed off
  `updated_at` to bust the immutable cache).

---

## 5. Authentication, moderation, and alerts

### Web sessions and mobile Bearer tokens

- **Web**: sealed cookies via `nuxt-auth-utils`.
- **Mobile**: `Authorization: Bearer <token>` backed by SHA-256 token hashes in
  `api_tokens` (`server/utils/mobileToken.ts`), accepted by
  `server/middleware/auth.ts` whenever no cookie session is present, with
  `last_used_at` writes throttled to once per hour.

`server/middleware/auth.ts` refreshes `event.context.user` from D1 on
authenticated API/page requests (skipping R2 blob streams, `/api/stats`,
`/sitemap.xml`, and public contact/newsletter routes so Grid View and scan loads
do not trigger redundant D1 lookups), and expires `admin_message` after 24
hours. `server/plugins/session.ts` reuses `event.context.user` when refreshing
`/api/_auth/session`. Password hashes use `hashUserPassword` and
`verifyUserPassword` in `server/utils/hash.ts` (`scrypt:<salt>:<hex>`), and
password changes or resets revoke existing `api_tokens`.

### Roles and guards

"Annotator" and "Archivist" share `role = 'archivist'`, separated by
`approved_at` (`useAuth().canSubmit`). Server endpoints layer `requireRole`,
`requireActiveUser` (not banned or muted), and `requireApproved`.

### Rate limiting and admin notifications

`server/utils/rateLimit.ts` uses a single `INSERT ... ON CONFLICT DO UPDATE ...
RETURNING count` statement against `rate_limits`, with probabilistic (~1%)
wall-clock `expires_at` cleanup offloaded via `waitUntil`.

Admin notifications (`server/utils/notify.ts` + `server/utils/telegram.ts`) send
Telegram messages via `waitUntil` to opted-in admins when submissions, access
requests, or safety reports arrive. Admins link their Telegram chat from
`Profile -> Alerts` using one-time codes verified via `getUpdates` (no webhook).

---

## 6. Data model

Eleven tables in `server/db/schema.ts`:

| Table                   | Holds                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `users`                 | Accounts, roles, moderation state, Telegram alert link/opt-in             |
| `restrooms`             | Catalog entries, `country`, `establishment` group key, crop JSON, R2 keys |
| `annotations`           | Comment text, 3D point, and framing camera snapshot                       |
| `annotation_reports`    | Reports against annotations, unique per `(annotation_id, reporter_id)`    |
| `restroom_reports`      | Safety reports against restroom entries, unique per reporter              |
| `user_blocks`           | Per-user blocks (`blocker_id`, `blocked_id`), filtering annotations       |
| `api_tokens`            | Hashed Bearer tokens for mobile clients                                   |
| `password_reset_tokens` | Hashed, single-use, one-hour password reset tokens                        |
| `admin_audit_log`       | Append-only record of admin actions                                       |
| `weekly_report_issues`  | Sent Weekly Report newsletter issues (JSON payload + rendered HTML)       |
| `rate_limits`           | Fixed-window rate-limit counters with wall-clock `expires_at`             |

### Multi-scan establishments (versions)

Multiple scans of the same physical restroom share an `establishment` key
(`shared/utils/versions.ts`, migration `0031`). List and Grid views render each
scan as its own row with `ArchiveDate` offering a date switcher across sibling
scans; MapView renders one pin per establishment; `/api/stats` counts distinct
establishments. Admins combine and split scans via `MergeDialog.vue` and
`/api/admin/restrooms/[id]/merge` and `/separate`.

### Restroom lifecycle and rejection grace period

Statuses are `pending`, `published`, `rejected`, `hidden` (bulk-applied on
submitter ban, storing the prior status in `pre_ban_status` so unbanning
restores each row accurately), and `removed` (immediate R2 blob deletion).

Rejecting a pending scan sets `rejected_at` and retains its R2 blobs for
`REJECTION_GRACE_DAYS` (30 days, `shared/utils/rejection.ts`) until swept by
`server/utils/purgeRejections.ts` (`scan_purged_at`), allowing admins to undo
accidental rejections from `AdminRejected`.

---

## 7. Migrations

All migrations in `server/db/migrations/NNNN_description.sql` are hand-written
SQL applied with Wrangler (`npm run db:migrate:local` and
`npm run db:migrate:remote`). When adding a table or column:

1. Write `server/db/migrations/NNNN_description.sql`.
2. Add the matching definition to `server/db/schema.ts` so Drizzle queries stay
   typed and aligned with live D1 (`npm run db:schema:dump`).
3. Apply locally, verify, then apply to production.

---

## 8. Deployment, R2 streaming, and configuration

### Route rules and CSP

`nuxt.config.ts` sets strict security headers on `/**`, including a
Content-Security-Policy permitting Turnstile, `'wasm-unsafe-eval'` for the Draco
WASM worker, `blob:` workers/connections for MapLibre and GLB loading,
`media-src 'self'` for guide videos, and `frame-ancestors 'none'`. `/` is
server-rendered without shared edge caching because its markup depends on the
visitor's `viewMode` and `theme` cookies as well as session state; `/studio`
runs client-only (`ssr: false`) to keep Three.js and MediaBunny out of the SSR
Worker bundle.

### R2 streaming and AI rights reservation

Scans (`/api/r2/models/**`) and thumbnails (`/api/r2/thumbs/**`) stream through
the Worker rather than a raw public R2 domain. Keeping `/api/r2/models/**`
behind the Worker enforces `SCAN_BURST_LIMIT` (100 scans per 5 minutes per IP)
and attaches `X-Robots-Tag: noai, noimageai, noindex` and `TDM-Reservation: 1`
alongside `/robots.txt` and `/ai.txt`.

---

## 9. Conventions

- **Formatting is Prettier's**, enforced by `npm run format:check` (with
  vendored `public/draco` excluded in `.prettierignore`). ESLint enforces
  correctness rules only (`@typescript-eslint/no-unused-vars`,
  `@typescript-eslint/no-explicit-any`, `no-console`).
- **Display modes (`light`, `dark`, `system`)** run through CSS custom
  properties in `assets/css/theme.css` keyed off `<html data-theme="...">` from
  the `theme` cookie (`composables/useTheme.ts`), avoiding first-paint flashes.
  The 3D viewer canvas stays black and `/studio` and `/newsletter` lock
  `data-theme="light"`.
- **`shared/utils/` is imported explicitly**, never auto-imported, because app
  and server layers have separate auto-import scopes.
- **Global stylesheets** in `assets/css/` hold shared tokens, forms, tabs, and
  account styles; MapLibre's stylesheet is imported inside `MapView.client.vue`
  so only map visitors download it.
- **Comments explain why, never what.** They are impersonal and use no em
  dashes.
- **Sizing follows the panel, not the window**, via `@container panel
(max-width: ...)` for panel UI and `@media` only for viewport-level switches
  like the 750px mobile sheet.

---

## 10. Known rough edges

- **`users.email_verified_at` is cleared on email change and never populated.**
  No verification flow currently writes or gates on the column; either build
  verification or drop the column in a future migration.
- **`restrooms.coords` is a legacy `NOT NULL` display string** derived from
  `lat`/`lng` (`formatCoords` in `shared/utils/regions.ts`) and is no longer
  returned by any API endpoint. Dropping it requires a table-rebuild migration.
