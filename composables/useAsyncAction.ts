import { apiErrorMessage } from "~~/shared/utils/apiError";

/**
 * Loading and error state for one form's submit.
 *
 * Wraps the try/catch/finally that every form in the account area repeats:
 * set loading, clear the previous error, run the request, record a readable
 * message if it throws, clear loading either way. Getting that wrong in one
 * copy is how a form ends up stuck in its loading state after a failure.
 *
 * For a surface with many independently pending controls, such as an admin
 * queue, use `useAdminAction` instead: it keys the pending state per control so
 * one row's request does not disable the rest.
 *
 * @param fallback Message shown when the failure carries none of its own.
 */
export function useAsyncAction(fallback = "Something went wrong.") {
  const loading = ref(false);
  const error = ref("");

  /**
   * Runs `fn`, reporting failure through `error` rather than throwing.
   *
   * @returns true if `fn` completed, false if it threw. Callers use this to
   *   decide whether to close the form, since closing on failure would discard
   *   what the user typed along with the error explaining why.
   */
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    loading.value = true;
    error.value = "";
    try {
      await fn();
      return true;
    } catch (e: unknown) {
      error.value = apiErrorMessage(e, fallback);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** Clears the error without running anything, for cancel and reopen. */
  function reset() {
    error.value = "";
  }

  /**
   * Sets an error the caller determined itself, such as a client-side
   * validation failure that never reaches the network.
   */
  function fail(message: string) {
    error.value = message;
  }

  // Reactive rather than a plain object of refs: nested refs do not unwrap in
  // templates, which would otherwise force `.value` into the markup.
  return reactive({ loading, error, run, reset, fail });
}
