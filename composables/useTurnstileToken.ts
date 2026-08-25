import type { Ref } from "vue";

/** Total time `waitForToken` will wait, and how often it re-checks. */
const POLL_INTERVAL_MS = 100;
const MAX_ATTEMPTS = 20;

/**
 * A Turnstile token ref, plus the wait that has to happen before it is used.
 *
 * The widget paints its success state slightly before the token reaches the
 * bound ref. That gap is invisible at human speed but easy to beat with an
 * Enter-key submit or a password manager's autofill, and a submit that wins the
 * race sends an empty token and is rejected by the server as a failed
 * challenge. Waiting briefly turns a confusing rejection into a non-event.
 *
 * Bind `token` to `<NuxtTurnstile v-model>`, then `await waitForToken()` at the
 * top of the submit handler and abandon the submit if it resolves false.
 *
 * Consolidates three hand-rolled copies of this loop, one of which had drifted
 * into only running when the token was already empty.
 */
export function useTurnstileToken() {
  const token = ref("");

  /**
   * Clears the token so the widget issues a fresh one. A Turnstile token is
   * single-use, so this must run after any failed submit that consumed it,
   * otherwise the retry is rejected for reusing a spent token.
   */
  function resetToken() {
    token.value = "";
  }

  return {
    token,
    resetToken,
    waitForToken: () => waitForTurnstileToken(token),
  };
}

/**
 * The wait on its own, for a caller that already owns a token ref.
 *
 * Resolves true once a token is present, or false if none arrives within
 * roughly two seconds. Returns immediately when a token is already set.
 *
 * @see useTurnstileToken
 */
export async function waitForTurnstileToken(
  token: Ref<string>,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !token.value; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return !!token.value;
}
