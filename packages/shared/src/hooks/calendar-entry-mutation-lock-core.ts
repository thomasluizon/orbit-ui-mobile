export interface PendingCalendarEntryMutation {
  checked: boolean
  settled: boolean
}

export function getCalendarEntryMutationKey(date: string, habitId: string): string {
  return `${date}:${habitId}`
}

export function pendingCalendarEntryStates(
  mutations: ReadonlyMap<string, PendingCalendarEntryMutation>,
): ReadonlyMap<string, boolean> {
  return new Map([...mutations].map(([entryKey, mutation]) => [entryKey, mutation.checked]))
}

export function reconciledCalendarEntryMutations(
  mutations: ReadonlyMap<string, PendingCalendarEntryMutation>,
  sourceEntryStates: ReadonlyMap<string, boolean>,
): Map<string, PendingCalendarEntryMutation> {
  return new Map([...mutations].filter(([entryKey, mutation]) =>
    !mutation.settled || sourceEntryStates.get(entryKey) !== mutation.checked))
}
