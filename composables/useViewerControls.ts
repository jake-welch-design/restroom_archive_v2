/**
 * The viewer's control menu, shared with the layout.
 *
 * The viewer folds all its controls behind one "more" button and owns the
 * open/closed flag, but on mobile the layout's catalog sheet has to stay clear
 * of whatever the menu shows. So the flag lives here, where the layout can read
 * it (to keep the sheet off an open column) and fold the menu itself (when the
 * sheet's grabber is dragged). `columnHeight` is the rendered height of the
 * control column, published by the viewer so the layout hears about it growing
 * (the crop tool's buttons arriving) and not just about it opening.
 * `cropping` mirrors the crop tool being open, which on mobile takes the whole
 * screen: the layout closes its sheet for it and brings it back afterwards.
 */
export function useViewerControls() {
  const open = useState<boolean>("viewerControlsOpen", () => false);
  const columnHeight = useState<number>("viewerControlsHeight", () => 0);
  const cropping = useState<boolean>("viewerCropping", () => false);
  return { open, columnHeight, cropping };
}
