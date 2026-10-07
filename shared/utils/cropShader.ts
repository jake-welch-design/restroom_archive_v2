/**
 * The GLSL that cuts a crop's boxes out of a scan in the fragment shader.
 *
 * three's own clipping planes can express one box, kept or removed, and no
 * more: a material's planes are either all unioned or all intersected, never
 * some of each. A crop with several removal boxes, or a kept box and removals
 * together, needs "outside this box, or inside any of those", so the test is
 * written out here instead and spliced into the scan's material with
 * `onBeforeCompile`.
 *
 * Shared because two renderers draw cropped scans and both have to cut the
 * same way: the viewer (composables/useThreeScene.ts) and the offline
 * thumbnail script (scripts/render-thumbs.ts). Plain strings, with no three
 * import, so the script can embed them in the page it serves.
 *
 * The boxes are in the crop's local space, the space shared/utils/crop.ts
 * stores them in. The vertex stage hands the fragment its world position and
 * `cropToLocal`, the inverse of the model wrapper's world matrix, takes it
 * back. Through world space rather than straight from the mesh's own position
 * because a GLB's meshes sit at any depth below that wrapper, each with its
 * own transform.
 */

/** Uniform names, so both renderers bind the same ones. */
export const CROP_UNIFORMS = {
  toLocal: "cropToLocal",
  keepMin: "cropKeepMin",
  keepMax: "cropKeepMax",
  removeMin: "cropRemoveMin",
  removeMax: "cropRemoveMax",
} as const;

/** Spliced after `#include <common>` in the vertex shader. */
export const CROP_VERTEX_PARS = "varying vec3 vCropWorld;";

/** Spliced after `#include <project_vertex>`, where `transformed` is final. */
export const CROP_VERTEX_MAIN =
  "vCropWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;";

/**
 * Spliced after `#include <common>` in the fragment shader.
 *
 * The array length has to be a compile-time constant, which is why the count
 * is part of the program and changing it means rebuilding the shader.
 */
export function cropFragmentPars(keep: boolean, removals: number): string {
  const u = CROP_UNIFORMS;
  return [
    "varying vec3 vCropWorld;",
    `uniform mat4 ${u.toLocal};`,
    keep ? `uniform vec3 ${u.keepMin};\nuniform vec3 ${u.keepMax};` : "",
    removals > 0
      ? `uniform vec3 ${u.removeMin}[${removals}];\nuniform vec3 ${u.removeMax}[${removals}];`
      : "",
  ].join("\n");
}

/**
 * Spliced before `#include <clipping_planes_fragment>`, the first thing in
 * main, so a discarded fragment costs nothing more.
 *
 * Strict comparisons for the removals, matching three's planes in `remove`
 * mode: a fragment exactly on a removal box's face survives.
 */
export function cropFragmentMain(keep: boolean, removals: number): string {
  const u = CROP_UNIFORMS;
  return [
    "{",
    `  vec3 cropP = (${u.toLocal} * vec4(vCropWorld, 1.0)).xyz;`,
    keep
      ? `  if (any(lessThan(cropP, ${u.keepMin})) || any(greaterThan(cropP, ${u.keepMax}))) discard;`
      : "",
    removals > 0
      ? [
          `  for (int i = 0; i < ${removals}; i++) {`,
          `    if (all(greaterThan(cropP, ${u.removeMin}[i])) && all(lessThan(cropP, ${u.removeMax}[i]))) discard;`,
          "  }",
        ].join("\n")
      : "",
    "}",
  ].join("\n");
}

/**
 * Rewrites a material's shader source to cut the boxes. Leaves it untouched
 * when there is nothing to cut.
 */
export function patchCropShader(
  shader: { vertexShader: string; fragmentShader: string },
  keep: boolean,
  removals: number,
): void {
  if (!keep && removals === 0) return;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${CROP_VERTEX_PARS}`)
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>\n${CROP_VERTEX_MAIN}`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>\n${cropFragmentPars(keep, removals)}`,
    )
    .replace(
      "#include <clipping_planes_fragment>",
      `${cropFragmentMain(keep, removals)}\n#include <clipping_planes_fragment>`,
    );
}
