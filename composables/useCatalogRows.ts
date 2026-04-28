import type { RestroomSummary } from "~/types/restroom";

export function useCatalogRows() {
  return useState<RestroomSummary[]>("catalogRows", () => []);
}
