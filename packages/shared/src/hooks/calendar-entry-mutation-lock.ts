'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface PendingCalendarEntryMutation {
  checked: boolean
  settled: boolean
}

interface CalendarEntryMutationLock {
  pendingEntryStates: ReadonlyMap<string, boolean>
  startEntryMutation: (
    entryKey: string,
    checked: boolean,
    mutation: () => Promise<unknown>
  ) => Promise<unknown> | null
}

export function getCalendarEntryMutationKey(date: string, habitId: string): string {
  return `${date}:${habitId}`
}

export function useCalendarEntryMutationLock(
  sourceEntryStates: ReadonlyMap<string, boolean>,
): CalendarEntryMutationLock {
  const sourceEntryStatesRef = useRef(sourceEntryStates)
  sourceEntryStatesRef.current = sourceEntryStates
  const pendingEntryMutationsRef = useRef(new Map<string, PendingCalendarEntryMutation>())
  const [pendingEntryStates, setPendingEntryStates] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  )

  const publishPendingEntryStates = useCallback(() => {
    setPendingEntryStates(new Map(
      [...pendingEntryMutationsRef.current].map(([entryKey, mutation]) => [
        entryKey,
        mutation.checked,
      ]),
    ))
  }, [])

  const releaseReconciledEntries = useCallback(() => {
    let released = false
    for (const [entryKey, mutation] of pendingEntryMutationsRef.current) {
      if (mutation.settled && sourceEntryStatesRef.current.get(entryKey) === mutation.checked) {
        pendingEntryMutationsRef.current.delete(entryKey)
        released = true
      }
    }
    if (released) publishPendingEntryStates()
  }, [publishPendingEntryStates])

  useEffect(() => {
    releaseReconciledEntries()
  }, [releaseReconciledEntries, sourceEntryStates])

  const startEntryMutation = useCallback((
    entryKey: string,
    checked: boolean,
    mutation: () => Promise<unknown>,
  ): Promise<unknown> | null => {
    if (pendingEntryMutationsRef.current.has(entryKey)) return null

    pendingEntryMutationsRef.current.set(entryKey, { checked, settled: false })
    publishPendingEntryStates()

    const mutationPromise = mutation()

    return mutationPromise.then(
      (result) => {
        const pendingMutation = pendingEntryMutationsRef.current.get(entryKey)
        if (pendingMutation) pendingMutation.settled = true
        releaseReconciledEntries()
        return result
      },
      (error: unknown) => {
        pendingEntryMutationsRef.current.delete(entryKey)
        publishPendingEntryStates()
        throw error
      },
    )
  }, [publishPendingEntryStates, releaseReconciledEntries])

  return { pendingEntryStates, startEntryMutation }
}
