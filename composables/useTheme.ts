/** What the viewer's display button is set to. */
export type ThemePref = "light" | "dark" | "system";
/** What is actually showing once "system" is resolved. */
export type Theme = "light" | "dark";

const ORDER: ThemePref[] = ["light", "dark", "system"];

// One listener for the whole app, however many components ask for the theme.
let mediaHooked = false;

/**
 * Light/dark display mode, cycled by the display button in the viewer's
 * control row (light → dark → system).
 *
 * The choice is kept in a cookie rather than localStorage so the server can
 * render `<html data-theme>` itself: the page arrives already in the right
 * colours instead of flashing light and switching once the client hydrates.
 * "system" is rendered as `data-theme="system"` and resolved by a
 * `prefers-color-scheme` query in assets/css/theme.css, so it needs no
 * JavaScript either. `resolved` is for code that has to pick something itself,
 * like the map choosing a basemap style.
 */
export function useTheme() {
  const pref = useCookie<ThemePref>("theme", {
    default: () => "light",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // The server can't see the OS setting; the CSS covers first paint, and this
  // catches up on the client.
  const systemDark = useState("theme:systemDark", () => false);
  if (import.meta.client && !mediaHooked) {
    mediaHooked = true;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    systemDark.value = mq.matches;
    mq.addEventListener("change", (e) => (systemDark.value = e.matches));
  }

  const resolved = computed<Theme>(() =>
    pref.value === "system"
      ? systemDark.value
        ? "dark"
        : "light"
      : pref.value === "dark"
        ? "dark"
        : "light",
  );

  function cycleTheme() {
    const i = ORDER.indexOf(pref.value);
    pref.value = ORDER[(i + 1) % ORDER.length]!;
  }

  return { pref, resolved, cycleTheme };
}
