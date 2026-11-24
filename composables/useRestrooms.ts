import type { RestroomSummary } from "~/types/restroom";

export function useRestrooms() {
  return useFetch<RestroomSummary[]>("/api/restrooms", {
    key: "restrooms",
    deep: false,
    default: () => [],
  });
}
