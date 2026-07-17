export interface StripGeom {
  /** Distance (px) from the panel's top to the top of `.controls`. */
  top: number;
  /** Height (px) of the header strip: `.controls` through the sub-header/thead. */
  height: number;
}

/**
 * Shared geometry of the catalog's sticky header strip. `Catalog.vue` measures
 * its own DOM and publishes the real rendered values here; the layout binds the
 * `.expand-tab` to them so the tab always lines up with the strip instead of
 * relying on hand-tuned pixel constants that drift across platforms/fonts.
 *
 * The defaults match the desktop strip closely enough to render correctly during
 * SSR and before the first client-side measurement.
 */
export function useStripGeom() {
  return useState<StripGeom>("stripGeom", () => ({ top: 61.5, height: 69 }));
}
