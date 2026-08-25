import { isFuture } from "~~/shared/utils/sqliteTime";

/**
 * The signed-in user and the permission questions the interface asks about
 * them.
 *
 * Wraps nuxt-auth-utils' `useUserSession()` so callers never re-derive
 * permissions from raw fields. "Is this user an admin" is one predicate defined
 * here, not a `role === "admin"` comparison repeated at each call site, which is
 * what keeps a rule like "admins can always submit" from being applied in some
 * places and forgotten in others.
 *
 * `user` is typed through the `#auth-utils` module augmentation in
 * types/auth.d.ts, which derives from the server's session projection. Reading
 * a field off it is checked, so the casts these predicates used to need are
 * gone.
 */
export function useAuth() {
  const { user, loggedIn, fetch: refreshSession } = useUserSession();

  async function signout() {
    await $fetch("/api/auth/signout", { method: "POST" });
    await refreshSession();
    await navigateTo("/");
  }

  const isAdmin = computed(() => user.value?.role === "admin");

  /**
   * Whether the user may submit a scan. Admins always may; everyone else needs
   * an approval an admin granted.
   */
  const canSubmit = computed(() => {
    if (!user.value) return false;
    return user.value.role === "admin" || !!user.value.approvedAt;
  });

  /** Whether a submission-access request is outstanding. */
  const submissionRequested = computed(
    () => !!user.value?.submissionRequestedAt,
  );

  const mutedUntil = computed(() => user.value?.mutedUntil ?? null);

  /**
   * Whether the mute is still in force. The column holds the expiry, so a past
   * timestamp means the mute has lapsed and no longer applies.
   */
  const isMuted = computed(() => isFuture(mutedUntil.value));

  /** A standing message from an admin, shown as a banner until it expires. */
  const adminMessage = computed(() => user.value?.adminMessage ?? null);

  return {
    user,
    loggedIn,
    loggedOut: computed(() => !loggedIn.value),
    canSubmit,
    submissionRequested,
    isAdmin,
    isMuted,
    mutedUntil,
    adminMessage,
    signout,
    refreshSession,
  };
}
