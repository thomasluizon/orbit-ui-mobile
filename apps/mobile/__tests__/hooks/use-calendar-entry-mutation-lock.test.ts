import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  useCalendarEntryMutationLock,
} from '@/hooks/use-calendar-entry-mutation-lock'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'

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

  await act(() => {
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
      await act(() => renderer?.update(React.createElement(Harness)))
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
    await act(() => {
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
    lock.renderer.update(React.createElement(React.Fragment))
  })

  it('releases a rejected mutation when the source identity stays unchanged', async () => {
    const lock = await renderMutationLock(false)
    const mutation = vi.fn().mockRejectedValue(new Error('write failed'))
    let request: Promise<unknown> | null = null

    await act(() => {
      request = lock.current().startEntryMutation(lock.entryKey, true, mutation)
      void request?.catch(() => undefined)
    })
    await act(async () => {
      await expect(request).rejects.toThrow('write failed')
    })

    expect(lock.current().pendingEntryStates.has(lock.entryKey)).toBe(false)
    lock.renderer.update(React.createElement(React.Fragment))
  })
})
