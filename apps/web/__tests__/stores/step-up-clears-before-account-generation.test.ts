import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { subscribeToAccountGeneration } from '@/lib/session-epoch'
import {
  clearStepUpState,
  hasApiKeyCreationGrant,
  markStepUpVerified,
} from '@/lib/step-up-storage'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'


let grantAtEachRise: boolean[] = []
let unsubscribe: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearStepUpState()
  grantAtEachRise = []
})

afterEach(() => {
  unsubscribe()
  clearStepUpState()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('clears the api key creation grant before an account replacement tells anyone', async () => {
  holdAccount('user-1')
  markStepUpVerified('keys')
  expect(hasApiKeyCreationGrant()).toBe(true)

  unsubscribe = subscribeToAccountGeneration(() => grantAtEachRise.push(hasApiKeyCreationGrant()))
  await replaceAccountWith('user-2')

  expect(grantAtEachRise).toEqual([false])
})

it('clears the api key creation grant before a sign in tells anyone', () => {
  holdAccount('user-3')
  markStepUpVerified('keys')
  expect(hasApiKeyCreationGrant()).toBe(true)

  unsubscribe = subscribeToAccountGeneration(() => grantAtEachRise.push(hasApiKeyCreationGrant()))
  holdAccount('user-4')

  expect(grantAtEachRise).toEqual([false])
})
