import type { RestroomSummary } from '~/types/restroom'

export function useDirectoryRows() {
  return useState<RestroomSummary[]>('directoryRows', () => [])
}
