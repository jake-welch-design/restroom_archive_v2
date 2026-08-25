# Architecture

How The Restroom Archive is put together, and why the less obvious parts are the
way they are. For setup and scripts, see the [README](../README.md).

---

## 1. The layout model

The application renders one persistent shell, `layouts/default.vue`, for every
route. It holds two things side by side:

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

**The viewer lives in the layout, not in a page.** That is the single most
consequential structural decision here, and everything below follows from it:

- Loading a photogrammetry GLB is expensive. Mounting the viewer per route would
  re-download and re-parse the scan on every navigation.
- WebGL context creation and teardown is not free either, and browsers cap how
  many live contexts a page may have.
- The submission wizard needs to preview an unsaved local scan in the same
  surface the archive uses. Because the viewer is layout-level, the wizard can
  take it over by writing a blob URL to shared state (§3).

The consequence is that navigation never disturbs the viewer. Selecting a
restroom changes a shared ref; the viewer swaps its model and disposes the old
one's GPU resources.

### The mobile sheet

Below 750px the two panes stack: the catalog becomes a top-anchored sheet whose
height is a fraction of the viewport, and `.expand-tab` becomes its grabber.

Two CSS variables, both published by the layout script, drive it:

- `--panel-frac`: the sheet's height as a fraction of the viewport.
- `--push-frac`: how far the viewer is pushed down.

`--push-frac` stops at the sheet's resting height (0.55) while `--panel-frac`
keeps going. Past that point the sheet slides _over_ the viewer rather than
squeezing it, which means the default view is exactly the un-dragged layout and
the viewer is not re-laid-out on every drag frame.

The drag's upper bound is measured, not fixed: `maxSheetFrac` reads the viewer's
bottom control row and stops the grabber before it would collide.

---

## 2. Strip geometry

This is the least self-evident mechanism in the codebase, and the one most
likely to look like an accident.

**The problem.** The `.expand-tab` that collapses the catalog panel has to line
up exactly with the panel's header strip: it starts just under the controls
row's top border and ends level with the sub-header's bottom border. Hand-tuned
pixel constants do not survive contact with reality, because the strip's real
height depends on font metrics and native control sizing, both of which differ
across platforms and shift again when a web font swaps in.

**The solution.** Measure the rendered geometry and publish it. Which side does
the measuring depends on whether the page has a strip of its own.

```
Catalog (has a controls strip)          Account / About (no strip)
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

Both directions measure rather than assume; they differ only in which element is
the source of truth.

Details worth knowing before changing any of it:

- `measureStrip` **sums** the two strip rows rather than spanning from the first
  one's top to the last one's bottom. The filter panel opens _between_ them, and
  a span would swallow it and stretch the tab.
- `useAlignToStrip` uses `min-height`, not `height`, so the row only ever grows.
  Content taller than the strip keeps its natural height rather than being
  clipped.
- Both re-measure on `document.fonts.ready`, because the web-font swap is a
  primary source of cross-platform drift.
- Both observe the target as well as the root. The page root is a fixed-height
  flex column, so it does not resize when the header row's content wraps.
- On the mobile sheet the tab moves to the panel's bottom edge, so there is
  nothing to align to. Both sides drop the variable there.

---

## 3. State and data flow

Composables fall into two groups, and the difference matters.

### Shared singletons (`useState`)

One instance per request, shared by every caller. Use these for state two
unrelated components must agree on.

| Composable                                   | Holds                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `useSelection`                               | Which restroom and annotation are selected                                         |
| `useCatalogRows`                             | The filtered, sorted rows, so the viewer's next/previous match what the list shows |
| `useStripGeom`                               | The measured header strip (§2)                                                     |
| `useSubmissionPreview`                       | The wizard's or admin queue's viewer takeover                                      |
| `useRestrooms`, `useStats`, `useAnnotations` | Keyed `useFetch` results                                                           |

### Per-caller helpers

Fresh state each call: `useAsyncAction`, `useAdminAction`, `useTurnstileToken`,
`useThreeScene`, `useAlignToStrip`, `useTagFilter`.

`useAsyncAction` and `useAdminAction` both return `reactive(...)` rather than an
object of refs, so templates read `action.loading` without `.value`. Nested refs
in a plain object do not unwrap in templates.

### Keyed fetches

Every list on the account page is read twice: the page counts it for a tab badge
and a child component renders it. `composables/useAccountData.ts` declares them
all with an explicit `key`, which is what makes those two callers share one
request and one cache entry. Without the key they would fetch separately and
drift apart after a refresh.

They also share three options, all deliberate:

- `server: false`, because none of it is public and SSR would put private data
  into a payload that route rules may allow to be cached.
- `immediate: false`, because at setup time the session has not resolved and the
  request would go out unauthenticated.
- `default: () => []`, so `.length` is safe before the first response.

### The empty-URL trap

This one has bitten before. Given:

```ts
useFetch(() => (slug.value ? `/api/restrooms/${slug.value}/annotations` : ""));
```

an empty URL does **not** skip the request. It resolves relative to the current
page and returns that page's HTML, which then fails to parse as the expected
array. `useAnnotations` works around it by setting `watch: false` and driving
`execute()` from its own watcher, clearing the data when the slug goes falsy.

### Viewer takeover

`useSubmissionPreview` exposes two refs that look similar and are not:

- `previewModelUrl` answers "what should the viewer show". Set by the wizard
  while a scan is loaded, and by the admin queue while a pending row is
  expanded. Non-null also hides the panel toggle, so the panel cannot be tucked
  away mid-preview.
- `hasUnsavedSubmission` is narrower: true only while the wizard has unsaved form
  progress. It gates the "leaving loses your submission" confirmation, which must
  not fire for the admin's read-only preview.

---

## 4. The viewer

`composables/useThreeScene.ts` owns the Three.js scene. `Viewer.client.vue`
owns the controls and annotation UI around it.

### Two camera modes

- **Orbit**: `OrbitControls`, 70° field of view. Auto-rotates slowly until the
  first interaction.
- **POV**: controls disabled, camera at eye height inside the scan, drag to look
  around, wheel and pinch adjust the field of view between 30° and 110°.

### Scans are photographed, not lit

Photogrammetry bakes real-world lighting into the base colour texture. Rendering
that with a PBR material means Three re-lights an already-lit image: dark
surfaces pick up ambient and environment fill, and the scan reads faded.

`toUnlitMaterial` converts every material to `MeshBasicMaterial`, which shows the
texture exactly as authored. Tone mapping is off for the same reason. This also
sidesteps a specific failure mode: glTF's `metallicFactor` defaults to 1, and
scans exported without it render black under a PBR material. With metalness out
of the pipeline entirely, the question does not arise.

### Disposal

`material.dispose()` does **not** cascade to textures. Skipping the manual
texture disposal leaves photogrammetry-sized textures resident on the GPU after
every model swap, which degrades quickly. `disposeMaterial` walks each material's
keys and disposes anything that is a texture.

`toUnlitMaterial` is the deliberate exception: it hands the textures to the new
material and disposes only the old material shell.

### Orbit pivot re-anchoring

`OrbitControls` sizes both its dolly step and its pan step from the distance
between the camera and `controls.target`. The pivot, not the geometry, decides
how fast the viewer moves.

For a room scan the target sits at the bounding box's centre, which is empty
air. Zoom in past a wall and the radius collapses toward zero while the surfaces
on screen are still metres away. Every wheel tick then dollies a fraction of that
tiny radius and a full drag pans almost nothing, which reads as the viewer
seizing up.

`reanchorOrbitTarget` fixes the pivot rather than the speeds: it casts a ray
along the camera's forward axis and pushes the target onto whatever surface it
hits, so the radius tracks what is actually on screen. The camera is never
touched, and `OrbitControls` recomputes its offset from the live target on each
update, so the view is identical before and after.

Because raycasting a photogrammetry mesh is O(triangles) with no BVH, the probe
is guarded three ways: an exact early-out when the radius is already large enough
that no hit could matter, a 250ms throttle, and a forced run only on interaction
start.

### Annotations

An annotation stores a point **and** the camera that framed it: mode, field of
view, orbit position and target or POV rotation, and the model's rotation at the
time. Selecting one calls `flyTo`, which tweens all of it so the reader arrives
at the exact view the author was describing.

The point is stored in **model-local** space, so markers track the model as it
auto-rotates. `project()` converts back to world space before projecting to
screen coordinates.

This is why hiding an annotation is reversible and deleting is not: the camera
snapshot is part of the content.

---

## 5. Authentication and roles

### Two ranks, one gate

| Rank      | Can                              | Granted by                    |
| --------- | -------------------------------- | ----------------------------- |
| Annotator | Read, annotate                   | Signing up                    |
| Archivist | The above, plus submit scans     | An admin approving a request  |
| Admin     | Everything, including moderation | An admin promoting an account |

"Annotator" and "Archivist" are the same `role` value (`archivist`); what
separates them is whether `approved_at` is set. Only `admin` is a distinct role.
`useAuth().canSubmit` is the single place that rule is expressed.

### The guard ladder

Server endpoints compose three guards, each adding one question:

```
requireRole(event, minimum)        Is the caller who they need to be?
        ▼
requireActiveUser(event, minimum)  ...and in good standing? (not banned, not muted)
        ▼
requireApproved(event)             ...and approved to submit?
```

Read endpoints deliberately stop at `requireRole`, so a muted user can still
browse the archive they cannot post to.

### Session freshness

The session cookie is a snapshot from sign-in. Two pieces keep it honest:

- `server/middleware/auth.ts` re-reads the user on every request and populates
  `event.context.user`. This is what makes a ban, mute, role change or revoked
  approval take effect on the caller's _next request_ rather than their next
  sign-in.
- `server/plugins/session.ts` hooks the session fetch so the same freshness
  reaches the client's own view of the user.

`server/utils/sessionUser.ts` owns the projection both use, and `types/auth.d.ts`
derives the `#auth-utils` `User` type from it rather than restating the fields.
That is not tidiness: a hand-written copy previously drifted a field ahead of
every query that populated it, which was five of the repository's type errors.

### Rate limiting

`server/utils/rateLimit.ts` uses a fixed-window counter in a `rate_limits` table,
keyed by IP or user id plus an action name. Applied to sign-in (10/hour), sign-up
and password reset requests (5/hour), the contact form (5/hour), and submission
access requests (3/day).

Cleanup is probabilistic: roughly 1% of calls delete windows older than ten, so
the table does not grow without bound and no scheduled job is needed.

---

## 6. Data model

Six tables in `server/db/schema.ts`.

| Table                   | Holds                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `users`                 | Accounts, roles, moderation state, the standing admin message |
| `restrooms`             | Catalog entries and their R2 keys                             |
| `annotations`           | Comment text, its 3D point, and the camera that framed it     |
| `annotation_reports`    | Reports against annotations, unique per reporter              |
| `password_reset_tokens` | Hashed, single-use, one-hour tokens                           |
| `admin_audit_log`       | Append-only record of admin actions                           |

### Restroom status

```
                submit
                  │
      ┌───────────┴───────────┐
      │ (admin)               │ (archivist)
      ▼                       ▼
  published ◄───publish─── pending
      │                       │
      │                       └──reject──► rejected
      │
      ├──admin bans submitter──► hidden
      │
      └──remove (grants a request)──► removed
```

Two things this diagram deliberately does not show, because they are not
statuses:

- **A removal request is not a status.** It is recorded in
  `restrooms.removal_requested_by`, and the entry stays `published` until an
  admin acts. Client code that filtered on a `removal_requested` status was
  checking a value nothing ever wrote.
- **`hidden` versus `rejected`.** `hidden` is applied in bulk when a submitter is
  banned; `rejected` is a per-entry decision. The submitter's own list shows both
  as "Rejected", because from their side the difference is not meaningful.

`rejected` and `removed` both delete the R2 blobs, through
`deleteRestroomBlobs`. The database row survives so the submitter can still see
what happened to it.

### Annotation moderation

Hiding sets `hidden_at` and `hidden_by`, and resolves every open report on that
annotation in the same operation. Hiding is reversible; deletion is only
available to the annotation's author and to admins.

Reports are unique per `(annotation_id, reporter_id)`, so one person cannot
inflate a count.

---

## 7. Migrations

**Read this before adding a table.** The workflow is not what the tooling
suggests.

Migrations `0000` and `0001` were generated by drizzle-kit. Everything from
`0002` onward is **hand-written SQL**, applied with:

```sh
npm run db:migrate:remote   # wrangler d1 migrations apply
```

Wrangler tracks what it has applied in its own `d1_migrations` table. The Drizzle
journal at `server/db/migrations/meta/_journal.json` still lists only the first
two, and is effectively abandoned.

Three consequences:

1. **`server/db/schema.ts` is the ORM's view, not the authority.** The live
   schema is. `npm run db:schema:dump` prints it.
2. **The two have already diverged.** `rate_limits` exists in migration `0011`
   and in production, and is absent from `schema.ts`. `server/utils/rateLimit.ts`
   consequently uses raw D1 `prepare()` calls rather than Drizzle.
3. **`npm run db:generate` would produce a migration diffed against a stale
   journal.** Do not reach for it without understanding that.

### Adding a table or column

1. Write the SQL by hand as `server/db/migrations/NNNN_description.sql`.
2. Add the matching definition to `server/db/schema.ts`, so queries stay typed.
3. Apply locally (`db:migrate:local`), then to production (`db:migrate:remote`).

Keeping step 2 is what stops the divergence widening. `rate_limits` is the
standing example of skipping it.

---

## 8. Deployment and configuration

### Route rules

`nuxt.config.ts` sets security headers on every route, including a
Content-Security-Policy that permits Turnstile's frame and script, `blob:` for
worker and connect sources (MapLibre and the GLB loader need it), and `https:`
images so R2 can serve from its own origin.

Rendering differs per route: `/` is SWR-cached for 60 seconds; `/r/**`, `/about`
and `/account` are server-rendered for their metadata.

### R2 access

Scans and thumbnails are served two ways:

- **Directly from R2**, when `NUXT_PUBLIC_MODELS_BASE_URL` or
  `NUXT_PUBLIC_THUMBS_BASE_URL` is set to a public bucket origin.
- **Proxied through the worker**, at `/api/r2/models/**` and
  `/api/r2/thumbs/**`, when they are not.

The proxy is the fallback, and it costs a worker invocation and the bandwidth per
scan. Setting the public URLs once a bucket has a custom domain is the intended
end state; the proxy routes can then be removed.

API responses return **relative** URLs. Absolute ones cannot be built reliably
during SSR, because Nitro's internal fetch reports `localhost` as the host. The
client resolves them against `document.baseURI`.

---

## 9. Conventions

- **Formatting is Prettier's**, enforced by `npm run format:check`. ESLint
  carries correctness rules only, with `eslint-config-prettier` disabling
  everything stylistic.
- **`shared/utils/` is imported explicitly**, not auto-imported, because both the
  app and the server layer use it and the two have different auto-import scopes.
- **Global stylesheets hold what components share.** A parent's scoped styles do
  not reach a child's markup, so anything used across the component boundary
  lives in `assets/css/`. `forms.css` and `account.css` document their own type
  scales.
- **Comments explain why, never what.** They are impersonal and use no em
  dashes.
- **Sizing follows the panel, not the window.** Most breakpoints are
  `@container panel (max-width: …)`, because the catalog panel is roughly half
  the viewport: at a 1120px window it is 560px wide, which is as tight as a
  phone. Only genuinely layout-level switches, such as the mobile sheet, use
  `@media`.

---

## 10. Known rough edges

Recorded rather than fixed, because each is a product decision rather than a
refactoring one.

- **`/` is SWR-cached while its markup varies by cookie.** `nuxt.config.ts` sets
  `"/": { swr: 60 }`, but `Catalog.vue` chooses list, grid or map from the
  `viewMode` cookie during server rendering. A cached response rendered for one
  view mode is therefore served to a visitor whose cookie asks for another.
  Vue patches the difference during hydration, so the visible result is correct
  and the only symptom is a "Hydration completed but contains mismatches"
  console warning, reproducible by changing view mode and then reloading within
  the cache window. Fixing it means picking one of three trade-offs: drop the
  SWR rule and pay full server rendering on the busiest route, render the view
  switcher client-only and accept a flash, or move the preference out of a
  cookie into local storage and out of the server-rendered markup entirely.

- **`/api/stats` counts every non-banned account as an "archivist"**, including
  annotators who have never been approved to submit. The About page's closing
  sentence therefore overstates the contributor count.
- **`users.email_verified_at` is written and never read.**
  `server/api/me/email.patch.ts` clears it on an email change, but no flow ever
  verifies an address or gates on the column. Either build the verification flow
  or drop the column.
- **`restrooms.coords` is a display string derived from lat/lng** and is no
  longer returned by any endpoint. It remains `NOT NULL`, so writes still
  populate it. Dropping it needs a migration.
- **The `/api/r2/**` proxy routes** are a stand-in for a public bucket origin,
  as described in §8.
