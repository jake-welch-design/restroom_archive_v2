import { apiErrorMessage } from "~~/shared/utils/apiError";

/**
 * Runs one admin mutation, tracking which is in flight and surfacing failures.
 *
 * Every admin control follows the same shape: POST to an endpoint, refresh
 * whatever list the change affects, disable just that one control while it is
 * pending, and show one error if it fails. Repeating that by hand is how the
 * account page ended up with fifteen near-identical try/catch blocks.
 *
 * Loading is a key rather than a boolean because the admin queues render many
 * rows at once. A boolean would grey out every button on the page while one
 * row's action was in flight. Callers pass a key that identifies the specific
 * control, conventionally `<subject>-<verb>-<id>`, and compare against
 * `isRunning(key)`.
 *
 * One instance per component. The queues, the accounts list, the annotation
 * browser and the audit log each own theirs, so an error raised in one section
 * does not appear over another.
 */
export function useAdminAction() {
  /** Key of the action currently in flight, or null when idle. */
  const runningKey = ref<string | null>(null);

  /** Message from the most recent failure. Cleared when a new action starts. */
  const error = ref("");

  function isRunning(key: string) {
    return runningKey.value === key;
  }

  /**
   * POSTs to `url`, then awaits `after` to refresh affected data.
   *
   * `after` runs only on success, and its own failure is reported the same way
   * the request's would be: a refresh that fails leaves the interface showing
   * stale data, which the user needs to know about.
   *
   * @param key Identifies the control, so only it shows a pending state.
   * @param body Optional JSON body for endpoints that take one.
   */
  async function run(
    key: string,
    url: string,
    options: {
      after?: () => Promise<unknown>;
      body?: Record<string, unknown>;
      fallbackError?: string;
    } = {},
  ): Promise<boolean> {
    runningKey.value = key;
    error.value = "";
    try {
      await $fetch(url, { method: "POST", body: options.body });
      await options.after?.();
      return true;
    } catch (e: unknown) {
      error.value = apiErrorMessage(
        e,
        options.fallbackError ?? "Action failed.",
      );
      return false;
    } finally {
      runningKey.value = null;
    }
  }

  // Reactive for the same reason as useAsyncAction: nested refs do not
  // unwrap in templates.
  return reactive({ runningKey, error, isRunning, run });
}
