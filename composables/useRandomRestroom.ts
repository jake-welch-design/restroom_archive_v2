export function useRandomRestroom() {
  const { data } = useRestrooms();
  const { select } = useSelection();
  return function randomPick() {
    const list = data.value?.filter((r) => r.lat != null && r.lng != null);
    if (!list?.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    select(pick.slug);
  };
}
