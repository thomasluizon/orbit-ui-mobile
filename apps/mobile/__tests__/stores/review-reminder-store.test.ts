import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const asyncStorageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageState.data.delete(key)
    }),
  },
}))

import { useReviewReminderStore } from '@/stores/review-reminder-store'

describe('review reminder store', () => {
  beforeEach(() => {
    asyncStorageState.data.clear()
    useReviewReminderStore.getState().reset()
  })

  afterEach(() => {
    asyncStorageState.data.clear()
  })

  it('resets reminder metrics when the signed-in account changes', () => {
    useReviewReminderStore.getState().setAccountScope('user-a')
    useReviewReminderStore.getState().trackCompletion('2026-04-14')
    useReviewReminderStore.getState().accept()

    useReviewReminderStore.getState().setAccountScope('user-b')

    expect(useReviewReminderStore.getState().accountKey).toBe('user-b')
    expect(useReviewReminderStore.getState().completionCount).toBe(0)
    expect(useReviewReminderStore.getState().activeDays).toEqual([])
    expect(useReviewReminderStore.getState().acceptedAt).toBeNull()
    expect(useReviewReminderStore.getState().dismissedUntil).toBeNull()
  })

  it('keeps reminder metrics when the account scope stays the same', () => {
    useReviewReminderStore.getState().setAccountScope('user-a')
    useReviewReminderStore.getState().trackCompletion('2026-04-14')

    useReviewReminderStore.getState().setAccountScope('user-a')

    expect(useReviewReminderStore.getState().accountKey).toBe('user-a')
    expect(useReviewReminderStore.getState().completionCount).toBe(1)
    expect(useReviewReminderStore.getState().activeDays).toEqual(['2026-04-14'])
  })

  it('clears persisted reminder metrics after rehydrating into a different account', async () => {
    asyncStorageState.data.set(
      'orbit-review-reminder',
      JSON.stringify({
        state: {
          accountKey: 'user-a',
          completionCount: 12,
          activeDays: ['2026-04-10', '2026-04-11'],
          dismissedUntil: '2026-08-12',
          acceptedAt: '2026-04-11T12:00:00.000Z',
        },
        version: 0,
      }),
    )

    await useReviewReminderStore.persist.rehydrate()

    expect(useReviewReminderStore.getState()).toMatchObject({
      accountKey: 'user-a',
      completionCount: 12,
      activeDays: ['2026-04-10', '2026-04-11'],
      dismissedUntil: '2026-08-12',
      acceptedAt: '2026-04-11T12:00:00.000Z',
    })

    useReviewReminderStore.getState().setAccountScope('user-b')

    expect(useReviewReminderStore.getState()).toMatchObject({
      accountKey: 'user-b',
      completionCount: 0,
      activeDays: [],
      dismissedUntil: null,
      acceptedAt: null,
    })
  })
})
