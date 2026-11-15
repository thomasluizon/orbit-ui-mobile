import { describe, expect, it } from 'vitest'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  STEP_UP_CHALLENGE_DURATION_MS,
  STEP_UP_RESEND_COOLDOWN_MS,
  createStepUpTimingRecord,
  extractStepUpAttemptsRemaining,
  formatStepUpCountdown,
  DELETE_ACCOUNT_FLOW_STEP_COUNT,
  getStepUpCooldownSeconds,
  getStepUpFlowProgress,
  getStepUpLockSeconds,
  getStepUpPhaseFromTiming,
  getStepUpStorageKey,
  normalizeStepUpCode,
  parseStepUpTimingRecord,
} from '../utils/step-up'

describe('getStepUpFlowProgress', () => {
  it('places the code of an account deletion as the last question of the delete flow', () => {
    expect(DELETE_ACCOUNT_FLOW_STEP_COUNT).toBe(3)
    expect(getStepUpFlowProgress('delete')).toEqual({ flow: 'delete_account', position: 3, total: 3 })
  })

  it('counts the code of an API key as its own one-step progress', () => {
    expect(getStepUpFlowProgress('keys')).toEqual({ flow: 'api_key_create', position: 1, total: 1 })
  })
})

describe('step-up core', () => {
  it('retains an active exhausted window across resends and resets attempt counts', () => {
    const previous = { operation: 'keys' as const, sentAt: 1_000, exhaustedAt: 2_000, failedAttempts: 3 }
    expect(createStepUpTimingRecord('keys', 3_000, previous)).toEqual({
      operation: 'keys', sentAt: 3_000, exhaustedAt: 2_000,
    })
    const sentAt = 2_000 + STEP_UP_ATTEMPT_WINDOW_MS
    expect(createStepUpTimingRecord('keys', sentAt, previous)).toEqual({ operation: 'keys', sentAt })
    expect(createStepUpTimingRecord('delete', 1_000, null)).toEqual({ operation: 'delete', sentAt: 1_000 })
  })
  it('isolates the verification timer by operation and account', () => {
    expect(getStepUpStorageKey('delete', 'account-1')).not.toBe(getStepUpStorageKey('keys', 'account-1'))
    expect(getStepUpStorageKey('delete', 'account-1')).not.toBe(getStepUpStorageKey('delete', 'account-2'))
  })
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
    expect(
      parseStepUpTimingRecord('{"operation":"delete","sentAt":100,"failedAttempts":2}'),
    ).toEqual({ operation: 'delete', sentAt: 100, failedAttempts: 2 })
    expect(parseStepUpTimingRecord('{"operation":"billing","sentAt":100}')).toBeNull()
    expect(parseStepUpTimingRecord('{"operation":"keys","sentAt":"100"}')).toBeNull()
    expect(
      parseStepUpTimingRecord('{"operation":"delete","sentAt":100,"failedAttempts":-1}'),
    ).toBeNull()
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
