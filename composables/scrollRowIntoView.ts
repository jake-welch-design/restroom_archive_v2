/**
 * Scrolls `scroller` so `el` sits at its top edge, the way
 * `el.scrollIntoView({ block: "start" })` would — except that it moves that one
 * scroller and nothing else.
 *
 * `scrollIntoView` walks every scrollable ancestor, and `overflow: hidden`
 * counts as scrollable: it clips, but script can still scroll it. The catalog
 * panel, the catalog itself and the layout shell are all `overflow: hidden`, so
 * any content that overflows one of them — a hydration mismatch once left a
 * stray row inside the panel — turns a scroll of the list into a scroll of the
 * whole panel, taking the header and the view controls off the top of the
 * screen with no way to scroll them back.
 *
 * Not a Vue composable despite living here; it's a DOM helper the catalog's two
 * list-like views share, and this directory is auto-imported.
 */
export function scrollRowIntoView(
  scroller: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const delta =
    el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  // `scrollTo` clamps for us, so an element near the end just scrolls as far as
  // the scroller goes.
  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior });
}
