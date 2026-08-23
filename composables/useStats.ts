export interface SiteStats {
  restrooms: number;
  cities: number;
  archivists: number;
}

export function useStats() {
  return useFetch<SiteStats>("/api/stats", {
    key: "stats",
    default: () => ({ restrooms: 0, cities: 0, archivists: 0 }),
  });
}
