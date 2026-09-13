import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  getCalendarEntryMutationKey,
  useCalendarEntryMutationLock,
} from '../hooks/calendar-entry-mutation-lock'

type MutationLock = ReturnType<typeof useCalendarEntryMutationLock>

async function renderMutationLock(initialSourceState: boolean) {
  const entryKey = getCalendarEntryMutationKey('2025-06-15', 'habit-1')
  let sourceEntryStates = new Map([[entryKey, initialSourceState]])
  let current: MutationLock | undefined
  let renderer: ReactTestRenderer | undefined

  function Harness() {
    current = useCalendarEntryMutationLock(sourceEntryStates)
    return null
  }

  await act(async () => {
    renderer = create(React.createElement(Harness))
  })

  return {
    current: () => {
      if (!current) throw new Error('Expected calendar entry mutation lock to initialize')
      return current
    },
    entryKey,
    reconcile: async (checked: boolean) => {
      sourceEntryStates = new Map([[entryKey, checked]])
      await act(async () => renderer?.update(React.createElement(Harness)))
    },
    renderer: renderer as ReactTestRenderer,
  }
}

describe('calendar entry mutation lock', () => {
  it('keeps a settled mutation locked until its source entry reconciles', async () => {
    let resolveMutation: (() => void) | undefined
    const mutationPromise = new Promise<void>((resolve) => {
      resolveMutation = resolve
    })
    const mutation = vi.fn(() => mutationPromise)
    const lock = await renderMutationLock(false)

    let firstRequest: Promise<unknown> | null = null
    act(() => {
      firstRequest = lock.current().startEntryMutation(lock.entryKey, true, mutation)
    })
    expect(lock.current().pendingEntryStates.get(lock.entryKey)).toBe(true)
    expect(lock.current().startEntryMutation(lock.entryKey, false, mutation)).toBeNull()

    await act(async () => {
      resolveMutation?.()
      await firstRequest
    })

    expect(lock.current().pendingEntryStates.get(lock.entryKey)).toBe(true)
    expect(lock.current().startEntryMutation(lock.entryKey, false, mutation)).toBeNull()

    await lock.reconcile(true)
    expect(lock.current().pendingEntryStates.has(lock.entryKey)).toBe(false)
    lock.renderer.unmount()
  })

  it('releases a rejected mutation without waiting for source reconciliation', async () => {
    const lock = await renderMutationLock(false)
    const mutation = vi.fn().mockRejectedValue(new Error('write failed'))
    let request: Promise<unknown> | null = null

    act(() => {
      request = lock.current().startEntryMutation(lock.entryKey, true, mutation)
    })
    await act(async () => {
      await expect(request).rejects.toThrow('write failed')
    })

    expect(lock.current().pendingEntryStates.has(lock.entryKey)).toBe(false)
    lock.renderer.unmount()
  })
})
