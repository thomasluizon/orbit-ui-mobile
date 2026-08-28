import { beforeEach, describe, expect, it } from 'vitest'
import { STEP_UP_ATTEMPT_WINDOW_MS } from '@orbit/shared/utils'
import {
  beginStepUpChallenge,
  markStepUpAttemptFailed,
  markStepUpExhausted,
  readStepUpTiming,
} from '@/lib/step-up-storage'

describe('web step up timing storage', () => {
  beforeEach(() => localStorage.clear())

  it('does not let a new code reset an active exhausted window', () => {
    const first = beginStepUpChallenge('delete', 1_000)
    markStepUpExhausted(first, 2_000)
    const resent = beginStepUpChallenge('delete', 2_000 + STEP_UP_ATTEMPT_WINDOW_MS - 1)

    expect(resent.exhaustedAt).toBe(2_000)
    expect(readStepUpTiming('delete')).toEqual(resent)
  })

  it('persists failed deletion attempts and resets them for a new challenge', () => {
    const first = beginStepUpChallenge('delete', 1_000)
    const failed = markStepUpAttemptFailed(markStepUpAttemptFailed(first))

    expect(readStepUpTiming('delete')).toEqual({ ...first, failedAttempts: 2 })
    expect(beginStepUpChallenge('delete', 2_000)).toEqual({
      operation: 'delete',
      sentAt: 2_000,
    })
    expect(failed.failedAttempts).toBe(2)
  })
})
