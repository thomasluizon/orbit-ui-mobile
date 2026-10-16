import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it } from 'vitest'
import { STEP_UP_ATTEMPT_WINDOW_MS } from '@orbit/shared/utils'
import {
  beginStepUpChallenge,
  bindStepUpStateToAccount,
  clearStepUpState,
  consumeApiKeyCreationGrant,
  hasApiKeyCreationGrant,
  isStepUpVerified,
  markStepUpAttemptFailed,
  markStepUpExhausted,
  markStepUpVerified,
  readStepUpTiming,
  readApiKeyExpiryDraft,
  retainApiKeyExpiryDraft,
} from '@/lib/step-up-storage'

const values = new Map<string, string>()

AsyncStorage.getItem = (key: string) => Promise.resolve(values.get(key) ?? null)
AsyncStorage.setItem = (key: string, value: string) => {
  values.set(key, value)
  return Promise.resolve()
}
AsyncStorage.removeItem = (key: string) => {
  values.delete(key)
  return Promise.resolve()
}
AsyncStorage.clear = () => {
  values.clear()
  return Promise.resolve()
}

const ACCOUNT = 'user-1'

describe('mobile step up timing storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    clearStepUpState()
  })

  it('does not let a new code reset an active exhausted window', async () => {
    const first = await beginStepUpChallenge('keys', ACCOUNT, 1_000)
    await markStepUpExhausted(first, ACCOUNT, 2_000)
    const resent = await beginStepUpChallenge(
      'keys',
      ACCOUNT,
      2_000 + STEP_UP_ATTEMPT_WINDOW_MS - 1,
    )

    expect(resent.exhaustedAt).toBe(2_000)
    expect(await readStepUpTiming('keys', ACCOUNT)).toEqual(resent)
  })

  it('persists failed deletion attempts and resets them for a new challenge', async () => {
    const first = await beginStepUpChallenge('delete', ACCOUNT, 1_000)
    const failedOnce = await markStepUpAttemptFailed(first, ACCOUNT)
    const failedTwice = await markStepUpAttemptFailed(failedOnce, ACCOUNT)

    expect(await readStepUpTiming('delete', ACCOUNT)).toEqual({ ...first, failedAttempts: 2 })
    expect(await beginStepUpChallenge('delete', ACCOUNT, 2_000)).toEqual({
      operation: 'delete',
      sentAt: 2_000,
    })
    expect(failedTwice.failedAttempts).toBe(2)
  })

  it('holds a verified result in memory for the session', () => {
    expect(isStepUpVerified('keys')).toBe(false)

    markStepUpVerified('keys')

    expect(isStepUpVerified('keys')).toBe(true)
    expect(isStepUpVerified('keys')).toBe(true)
  })

  it('consumes the create grant without hiding key management', () => {
    markStepUpVerified('keys')

    consumeApiKeyCreationGrant()

    expect(hasApiKeyCreationGrant()).toBe(false)
    expect(isStepUpVerified('keys')).toBe(true)
  })

  it('clears visibility, the create grant and the expiry draft when the account changes', () => {
    bindStepUpStateToAccount('account-a')
    markStepUpVerified('keys')
    retainApiKeyExpiryDraft('2099-12-31T23:59')

    bindStepUpStateToAccount('account-b')

    expect(isStepUpVerified('keys')).toBe(false)
    expect(hasApiKeyCreationGrant()).toBe(false)
    expect(readApiKeyExpiryDraft()).toBe('')
    bindStepUpStateToAccount('account-a')
    expect(readApiKeyExpiryDraft()).toBe('')
  })

  it('keeps the expiry through grant renewal for the same account', () => {
    bindStepUpStateToAccount(ACCOUNT)
    retainApiKeyExpiryDraft('2099-12-31T23:59')
    consumeApiKeyCreationGrant()
    bindStepUpStateToAccount(ACCOUNT)
    markStepUpVerified('keys')

    expect(readApiKeyExpiryDraft()).toBe('2099-12-31T23:59')
  })

  it('forgets expiry drafts on sign out and ignores typing without an account', () => {
    bindStepUpStateToAccount(ACCOUNT)
    retainApiKeyExpiryDraft('2099-12-31T23:59')
    clearStepUpState()
    retainApiKeyExpiryDraft('2099-12-31T23:59')

    expect(readApiKeyExpiryDraft()).toBe('')
  })
})
