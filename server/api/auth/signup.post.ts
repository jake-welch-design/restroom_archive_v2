export default defineEventHandler(() => {
  // Sign-ups are invite-only during the beta. Visitors apply via /api/beta/apply
  // and receive an invite link on approval (claimed through /api/beta/claim).
  throw createError({
    statusCode: 403,
    statusMessage: 'Sign-ups are invite-only during the beta. Request access to become a beta-archivist.',
  })
})
