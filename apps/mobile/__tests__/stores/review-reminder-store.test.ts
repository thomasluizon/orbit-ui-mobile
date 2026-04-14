import { beforeEach, describe, expect, it } from 'vitest'
import { useReviewReminderStore } from '@/stores/review-reminder-store'

describe('review reminder store', () => {
  beforeEach(() => {
    useReviewReminderStore.getState().reset()
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
})
