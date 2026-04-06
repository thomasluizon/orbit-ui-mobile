export function shouldResetSelectionForViewChange(
  previousView: string,
  nextView: string,
): boolean {
  return previousView !== nextView
}

export function getHabitListExtraData(
  isSelectMode: boolean,
  selectedHabitIds: ReadonlySet<string>,
  recentlyCompletedIds: ReadonlySet<string>,
): string {
  const sortAlphabetically = (left: string, right: string) =>
    left.localeCompare(right)

  const selectedKey = Array.from(selectedHabitIds)
    .sort(sortAlphabetically)
    .join(',')
  const completedKey = Array.from(recentlyCompletedIds)
    .sort(sortAlphabetically)
    .join(',')

  return `${isSelectMode ? '1' : '0'}|${selectedKey}|${completedKey}`
}
