'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { pendingCalendarEntryStates, reconciledCalendarEntryMutations, type PendingCalendarEntryMutation } from '@orbit/shared/hooks'

interface CalendarEntryMutationLock {
  pendingEntryStates: ReadonlyMap<string, boolean>
  startEntryMutation: (
    entryKey: string,
    checked: boolean,
    mutation: () => Promise<unknown>
  ) => Promise<unknown> | null
}

export function useCalendarEntryMutationLock(
  sourceEntryStates: ReadonlyMap<string, boolean>,
): CalendarEntryMutationLock {
  const sourceEntryStatesRef = useRef(sourceEntryStates)
  useEffect(() => {
    sourceEntryStatesRef.current = sourceEntryStates
  }, [sourceEntryStates])
  const pendingEntryMutationsRef = useRef(new Map<string, PendingCalendarEntryMutation>())
  const [pendingEntryStates, setPendingEntryStates] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  )

  const publishPendingEntryStates = useCallback(() => {
    setPendingEntryStates(pendingCalendarEntryStates(pendingEntryMutationsRef.current))
  }, [])

  const releaseReconciledEntries = useCallback(() => {
    const remaining = reconciledCalendarEntryMutations(
      pendingEntryMutationsRef.current,
      sourceEntryStatesRef.current,
    )
    if (remaining.size !== pendingEntryMutationsRef.current.size) {
      pendingEntryMutationsRef.current = remaining
      publishPendingEntryStates()
    }
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
    const sourceChecked = sourceEntryStatesRef.current.get(entryKey)
    if (sourceChecked === undefined) return null

    pendingEntryMutationsRef.current.set(entryKey, {
      checked,
      settled: false,
    })
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
