export function useRandomRestroom() {
  const { data } = useRestrooms()
  const { select } = useSelection()
  return function randomPick() {
    const list = data.value
    if (!list?.length) return
    const pick = list[Math.floor(Math.random() * list.length)]
    select(pick.slug)
  }
}
