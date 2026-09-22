export interface SiteStats {
  restrooms: number;
  cities: number;
  /**
   * Null when the archive cannot yet vouch for the figure -- some published
   * entry has no country stored. Callers omit the count rather than filling in
   * a zero or a guess. See server/api/stats.get.ts.
   */
  countries: number | null;
  archivists: number;
}

export function useStats() {
  return useFetch<SiteStats>("/api/stats", {
    key: "stats",
    default: () => ({
      restrooms: 0,
      cities: 0,
      countries: null,
      archivists: 0,
    }),
  });
}
