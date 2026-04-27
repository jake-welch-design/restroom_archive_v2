// Reserved identifiers we never let users register. Includes route-collision
// risks (login, account, r, …), role-impersonation words (admin, moderator),
// and the two pre-existing accounts' handles so they can't be re-claimed if
// renamed away.
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'support', 'restroomarchive', 'moderator', 'mod',
  'api', 'root', 'system', 'staff', 'help', 'about', 'account',
  'login', 'signin', 'signup', 'logout', 'me', 'user', 'users',
  'r', 'restroom', 'restrooms', 'submit',
])

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export type UsernameValidation =
  | { ok: true, value: string }
  | { ok: false, reason: string }

export function validateUsername(raw: string): UsernameValidation {
  const value = normalizeUsername(raw)
  if (value.length < 3 || value.length > 20) {
    return { ok: false, reason: 'Username must be 3–20 characters.' }
  }
  if (!/^[a-z0-9_]+$/.test(value)) {
    return { ok: false, reason: 'Username may only contain lowercase letters, numbers, and underscores.' }
  }
  if (RESERVED_USERNAMES.has(value)) {
    return { ok: false, reason: 'That username is reserved.' }
  }
  return { ok: true, value }
}
