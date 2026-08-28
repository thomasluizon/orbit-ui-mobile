import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it } from 'vitest'
import { STEP_UP_ATTEMPT_WINDOW_MS } from '@orbit/shared/utils'
import {
  beginStepUpChallenge,
  markStepUpAttemptFailed,
  markStepUpExhausted,
  readStepUpTiming,
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

describe('mobile step up timing storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  it('does not let a new code reset an active exhausted window', async () => {
    const first = await beginStepUpChallenge('keys', 1_000)
    await markStepUpExhausted(first, 2_000)
    const resent = await beginStepUpChallenge(
      'keys',
      2_000 + STEP_UP_ATTEMPT_WINDOW_MS - 1,
    )

    expect(resent.exhaustedAt).toBe(2_000)
    expect(await readStepUpTiming('keys')).toEqual(resent)
  })

  it('persists failed deletion attempts and resets them for a new challenge', async () => {
    const first = await beginStepUpChallenge('delete', 1_000)
    const failedOnce = await markStepUpAttemptFailed(first)
    const failedTwice = await markStepUpAttemptFailed(failedOnce)

    expect(await readStepUpTiming('delete')).toEqual({ ...first, failedAttempts: 2 })
    expect(await beginStepUpChallenge('delete', 2_000)).toEqual({
      operation: 'delete',
      sentAt: 2_000,
    })
    expect(failedTwice.failedAttempts).toBe(2)
  })
})
