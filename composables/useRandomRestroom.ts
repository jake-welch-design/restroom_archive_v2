import { latestPerEntry } from "~~/shared/utils/versions";

export function useRandomRestroom() {
  const { data } = useRestrooms();
  const { select } = useSelection();
  return function randomPick() {
    // One ticket per place, at its latest scan. Drawing from every scan would
    // weight a place by its number of scans, and land on an old one as often
    // as the current one.
    const list = latestPerEntry(
      (data.value ?? []).filter((r) => r.status !== "pending"),
    ).filter((r) => r.lat != null && r.lng != null);
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    select(pick.slug);
  };
}
