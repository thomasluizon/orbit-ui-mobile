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
  const selectedKey = Array.from(selectedHabitIds).sort().join(',')
  const completedKey = Array.from(recentlyCompletedIds).sort().join(',')

  return `${isSelectMode ? '1' : '0'}|${selectedKey}|${completedKey}`
}
