export function useAuth() {
  const { user, loggedIn, fetch: refreshSession } = useUserSession()

  async function signout() {
    await $fetch('/api/auth/signout', { method: 'POST' })
    await refreshSession()
    await navigateTo('/')
  }

  const approved = computed(() => {
    const u = user.value as { role?: string; approvedAt?: string | null } | null
    if (!u) return false
    if (u.role === 'admin') return true
    return !!u.approvedAt
  })

  const isAdmin = computed(() => {
    const u = user.value as { role?: string } | null
    return u?.role === 'admin'
  })

  return {
    user,
    loggedIn,
    loggedOut: computed(() => !loggedIn.value),
    approved,
    isAdmin,
    signout,
    refreshSession,
  }
}
