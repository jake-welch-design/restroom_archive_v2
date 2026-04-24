// Backfill `lat` / `lng` on the `restrooms` table by parsing the display `coords`
// string (e.g. "40.66 N, 73.98 W"). Run once after phase-2 migration.
//
//   npx tsx scripts/backfill-latlng.ts --remote
//
import { execSync } from 'node:child_process'

type Row = { id: number; slug: string; coords: string; lat: number | null; lng: number | null }

const target = process.argv.includes('--remote') ? '--remote' : '--local'

function wrangler(sql: string): { results: Row[] } {
  const out = execSync(
    `npx wrangler d1 execute restroom-archive-db ${target} --json --command ${JSON.stringify(sql)}`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] },
  )
  return JSON.parse(out)[0]
}

function parseCoords(s: string): { lat: number; lng: number } | null {
  const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*([NS])\s*,\s*(\d+(?:\.\d+)?)\s*([EW])\s*$/i)
  if (!m) return null
  const [, latStr, ns, lngStr, ew] = m
  const lat = Number(latStr) * (ns.toUpperCase() === 'N' ? 1 : -1)
  const lng = Number(lngStr) * (ew.toUpperCase() === 'E' ? 1 : -1)
  return { lat, lng }
}

const rows = wrangler('SELECT id, slug, coords, lat, lng FROM restrooms').results
console.log(`Found ${rows.length} rows`)

let updated = 0
let skipped = 0
const failed: string[] = []

for (const row of rows) {
  if (row.lat != null && row.lng != null) { skipped++; continue }
  const parsed = parseCoords(row.coords)
  if (!parsed) { failed.push(`${row.slug} :: "${row.coords}"`); continue }
  const sql = `UPDATE restrooms SET lat = ${parsed.lat}, lng = ${parsed.lng} WHERE id = ${row.id}`
  wrangler(sql)
  updated++
  if (updated % 10 === 0) console.log(`  ... ${updated} updated`)
}

console.log(`\nDone. updated=${updated} skipped(already-set)=${skipped} failed=${failed.length}`)
if (failed.length) {
  console.log('\nUnparseable coords strings:')
  for (const f of failed) console.log(`  ${f}`)
}
