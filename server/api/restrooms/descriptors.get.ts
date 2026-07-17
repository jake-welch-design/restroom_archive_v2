import { inArray } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { parseDescriptors } from '~~/server/utils/descriptors'

// Distinct descriptors previously used across the archive, ordered by how
// often they appear so the most common suggestions surface first. Powers the
// tag suggestion dropdown on the submission / edit forms.
export default defineEventHandler(async (event) => {
  const db = useDb(event)

  const isAdmin = event.context.user?.role === 'admin'
  const statuses = isAdmin ? ['published', 'pending'] : ['published']

  const rows = await db
    .select({ descriptors: schema.restrooms.descriptors })
    .from(schema.restrooms)
    .where(inArray(schema.restrooms.status, statuses))
    .all()

  // Aggregate by lowercased key to merge case variants, keeping the first-seen
  // display casing and counting frequency for ordering.
  const counts = new Map<string, { display: string, count: number }>()
  for (const row of rows) {
    for (const tag of parseDescriptors(row.descriptors)) {
      const key = tag.toLowerCase()
      const existing = counts.get(key)
      if (existing) existing.count++
      else counts.set(key, { display: tag, count: 1 })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .map(e => e.display)
})
