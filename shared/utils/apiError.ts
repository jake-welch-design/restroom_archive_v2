/**
 * Turns a thrown `$fetch` rejection into a message worth showing a user.
 *
 * Nitro reports a handler's `statusMessage` in the response body, so that is
 * the preferred source: it is the sentence the endpoint deliberately wrote. But
 * not every failure gets that far. A 500 raised inside Nitro, a network drop, or
 * an aborted request carries no body at all, and reading only `data.statusMessage`
 * turns every one of those into the same unhelpful fallback.
 *
 * The order below therefore walks outward from most specific to least: the
 * body's `statusMessage`, the body's `message`, the error's own `statusMessage`,
 * the error's own `message`, and only then the caller's fallback.
 *
 * Replaces 22 partial copies of this logic, most of which stopped at the first
 * step. The account page's delete-account handler had already worked the full
 * chain out; this generalises that version rather than the common thin one.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    data?: { statusMessage?: string; message?: string } | string | null;
    statusMessage?: string;
    message?: string;
  };

  const fromBody =
    err?.data && typeof err.data === "object"
      ? (err.data.statusMessage ?? err.data.message)
      : undefined;

  return fromBody || err?.statusMessage || err?.message || fallback;
}
