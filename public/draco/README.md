# Draco decoder

The decoder `DRACOLoader` uses to read Draco-compressed meshes out of a `.glb`.

Copied verbatim from `node_modules/three/examples/jsm/libs/draco/gltf/`, which
is where three ships the build intended for glTF. **Not** the copy one directory
up: that one is the general-purpose build, and the `gltf/` variant is the one
three's own `DRACOLoader` documentation points at.

    cp node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js \
       node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm \
       public/draco/

Vendored rather than pulled from a CDN so the viewer has no third-party runtime
dependency and needs no exception in the Content-Security-Policy: served from
`public/`, the decoder is same-origin and satisfies `connect-src 'self'`. It is
also served straight off Cloudflare Pages' static assets, so it never touches
the Worker.

## Refresh this when three is upgraded

These files are a copy, so a `three` upgrade does not move them. Re-run the copy
above after changing the `three` version in package.json. The decoder format is
stable across three releases, so a stale copy will usually keep working rather
than fail loudly -- which is exactly why it is worth doing deliberately.

## What is not here

`draco_decoder.js`, the pure-JavaScript fallback `DRACOLoader` reaches for when
`WebAssembly` is missing, is omitted -- it is 500 KB and every browser the site
supports has WebAssembly. `draco_encoder.js` is only needed to _write_ Draco and
the site never does.

Note that the fallback would not rescue a CSP problem anyway: if WebAssembly
exists but the policy blocks compiling it, `DRACOLoader` still takes the wasm
path and fails there. That is why `nuxt.config.ts` carries `'wasm-unsafe-eval'`
in `script-src` rather than relying on a fallback.
