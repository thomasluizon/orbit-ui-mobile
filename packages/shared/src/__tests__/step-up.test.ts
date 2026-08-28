import { describe, expect, it } from 'vitest'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  STEP_UP_CHALLENGE_DURATION_MS,
  STEP_UP_RESEND_COOLDOWN_MS,
  extractStepUpAttemptsRemaining,
  formatStepUpCountdown,
  getStepUpCooldownSeconds,
  getStepUpLockSeconds,
  getStepUpPhaseFromTiming,
  normalizeStepUpCode,
  parseStepUpTimingRecord,
} from '../utils/step-up'

describe('step-up core', () => {
  it('normalizes one spanning code input', () => {
    expect(normalizeStepUpCode('12 a34-567')).toBe('123456')
  })

  it('derives cooldown, expiry, and lock from persisted event times', () => {
    const sentAt = 1_000
    const record = { operation: 'delete' as const, sentAt, exhaustedAt: 2_000 }

    expect(getStepUpCooldownSeconds(record, sentAt)).toBe(STEP_UP_RESEND_COOLDOWN_MS / 1000)
    expect(getStepUpPhaseFromTiming(record, 2_000)).toBe('exhausted')
    expect(getStepUpLockSeconds(record, 2_000)).toBe(STEP_UP_ATTEMPT_WINDOW_MS / 1000)
    expect(
      getStepUpPhaseFromTiming(
        { operation: 'delete', sentAt },
        sentAt + STEP_UP_CHALLENGE_DURATION_MS,
      ),
    ).toBe('expired')
  })

  it('accepts only valid persisted records', () => {
    expect(parseStepUpTimingRecord('{"operation":"keys","sentAt":100}')).toEqual({
      operation: 'keys',
      sentAt: 100,
    })
    expect(parseStepUpTimingRecord('{"operation":"billing","sentAt":100}')).toBeNull()
    expect(parseStepUpTimingRecord('{"operation":"keys","sentAt":"100"}')).toBeNull()
    expect(parseStepUpTimingRecord('not json')).toBeNull()
  })

  it('uses only a remaining count present in the backend message', () => {
    expect(extractStepUpAttemptsRemaining('Invalid code. Remaining attempts: 2')).toBe(2)
    expect(extractStepUpAttemptsRemaining('Invalid code')).toBeNull()
    expect(extractStepUpAttemptsRemaining(undefined)).toBeNull()
  })

  it('formats countdowns with tabular minute and second positions', () => {
    expect(formatStepUpCountdown(47)).toBe('0:47')
    expect(formatStepUpCountdown(878)).toBe('14:38')
    expect(formatStepUpCountdown(-1)).toBe('0:00')
  })
})
