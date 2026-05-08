export function useAuth() {
  const { user, loggedIn, fetch: refreshSession } = useUserSession()

  async function signout() {
    await $fetch('/api/auth/signout', { method: 'POST' })
    await refreshSession()
    await navigateTo('/')
  }

  const isAdmin = computed(() => {
    const u = user.value as { role?: string } | null
    return u?.role === 'admin'
  })

  const canSubmit = computed(() => {
    const u = user.value as { role?: string; approvedAt?: string | null } | null
    if (!u) return false
    if (u.role === 'admin') return true
    return !!u.approvedAt
  })

  const submissionRequested = computed(() => {
    const u = user.value as { submissionRequestedAt?: string | null } | null
    return !!u?.submissionRequestedAt
  })

  const mutedUntil = computed(() => {
    const u = user.value as { mutedUntil?: string | null } | null
    return u?.mutedUntil ?? null
  })

  const isMuted = computed(() => {
    const value = mutedUntil.value
    if (!value) return false
    const ms = Date.parse(`${value.replace(' ', 'T')}Z`)
    return Number.isFinite(ms) && ms > Date.now()
  })

  const adminMessage = computed(() => {
    const u = user.value as { adminMessage?: string | null } | null
    return u?.adminMessage ?? null
  })

  const emailVerified = computed(() => {
    const u = user.value as { emailVerifiedAt?: string | null } | null
    return !!u?.emailVerifiedAt
  })

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
    emailVerified,
    signout,
    refreshSession,
  }
}
