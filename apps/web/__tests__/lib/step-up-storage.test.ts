import { beforeEach, describe, expect, it } from 'vitest'
import { STEP_UP_ATTEMPT_WINDOW_MS } from '@orbit/shared/utils'
import {
  beginStepUpChallenge,
  clearStepUpState,
  markStepUpAttemptFailed,
  markStepUpExhausted,
  readStepUpTiming,
} from '@/lib/step-up-storage'

const ACCOUNT = 'user-1'

describe('web step up timing storage', () => {
  beforeEach(() => {
    localStorage.clear()
    clearStepUpState()
  })

  it('does not let a new code reset an active exhausted window', () => {
    const first = beginStepUpChallenge('delete', ACCOUNT, 1_000)
    markStepUpExhausted(first, ACCOUNT, 2_000)
    const resent = beginStepUpChallenge('delete', ACCOUNT, 2_000 + STEP_UP_ATTEMPT_WINDOW_MS - 1)

    expect(resent.exhaustedAt).toBe(2_000)
    expect(readStepUpTiming('delete', ACCOUNT)).toEqual(resent)
  })

  it('persists failed deletion attempts and resets them for a new challenge', () => {
    const first = beginStepUpChallenge('delete', ACCOUNT, 1_000)
    const failed = markStepUpAttemptFailed(markStepUpAttemptFailed(first, ACCOUNT), ACCOUNT)

    expect(readStepUpTiming('delete', ACCOUNT)).toEqual({ ...first, failedAttempts: 2 })
    expect(beginStepUpChallenge('delete', ACCOUNT, 2_000)).toEqual({
      operation: 'delete',
      sentAt: 2_000,
    })
    expect(failed.failedAttempts).toBe(2)
  })
})
