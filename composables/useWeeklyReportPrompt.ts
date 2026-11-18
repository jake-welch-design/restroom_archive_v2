/**
 * Whether this browser has already dealt with the Weekly Report pop-up:
 * closed it, or signed up (from it or from the About page).
 *
 * localStorage, per visitor and per browser, which is all a "don't ask again"
 * needs. Where storage is unavailable (private modes, blocked site data) the
 * answer is "handled", so a visitor who cannot be remembered is never asked on
 * every page load.
 */
const KEY = "weeklyReport:prompt";

export function weeklyReportPromptHandled(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function markWeeklyReportPrompt(state: "dismissed" | "subscribed") {
  try {
    localStorage.setItem(KEY, state);
  } catch {
    // Nothing to remember it in; see above.
  }
}
