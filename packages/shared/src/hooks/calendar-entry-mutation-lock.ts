'use client'

import { useCallback, useRef, useState } from 'react'

interface CalendarEntryMutationLock {
  inFlightEntryKeys: ReadonlySet<string>
  startEntryMutation: (
    entryKey: string,
    mutation: () => Promise<unknown>
  ) => Promise<unknown> | null
}

export function getCalendarEntryMutationKey(date: string, habitId: string): string {
  return `${date}:${habitId}`
}

export function useCalendarEntryMutationLock(): CalendarEntryMutationLock {
  const inFlightEntryKeysRef = useRef(new Set<string>())
  const [inFlightEntryKeys, setInFlightEntryKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  const startEntryMutation = useCallback((
    entryKey: string,
    mutation: () => Promise<unknown>,
  ): Promise<unknown> | null => {
    if (inFlightEntryKeysRef.current.has(entryKey)) return null

    inFlightEntryKeysRef.current.add(entryKey)
    setInFlightEntryKeys(new Set(inFlightEntryKeysRef.current))

    return mutation().finally(() => {
      inFlightEntryKeysRef.current.delete(entryKey)
      setInFlightEntryKeys(new Set(inFlightEntryKeysRef.current))
    })
  }, [])

  return { inFlightEntryKeys, startEntryMutation }
}
