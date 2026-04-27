import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDb, schema } from '~~/server/utils/db'
import { requireActiveUser } from '~~/server/utils/requireActiveUser'

// Vue's `{{ }}` interpolation escapes HTML, but we still strip ASCII control
// chars so a stray newline or NUL can't sneak into a stored identifier.
function hasControlChars(s: string) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return true
  }
  return false
}

const Body = z.object({
  // Empty string clears the display name and falls back to @username at render.
  displayName: z.string().max(25).optional(),
})

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event)
  const body = await readValidatedBody(event, Body.parse)

  const trimmed = body.displayName?.trim() ?? ''
  if (hasControlChars(trimmed)) {
    throw createError({ statusCode: 422, statusMessage: 'Display name contains invalid characters' })
  }
  const next = trimmed.length === 0 ? null : trimmed

  const db = useDb(event)
  await db
    .update(schema.users)
    .set({ displayName: next })
    .where(eq(schema.users.id, user.id))

  return { ok: true, displayName: next }
})
