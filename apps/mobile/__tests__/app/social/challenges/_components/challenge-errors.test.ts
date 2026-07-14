import { describe, expect, it } from 'vitest'

import { getChallengeErrorKey } from '@/app/social/challenges/_components/challenge-errors'

describe('getChallengeErrorKey', () => {
  it('maps a 429 status to the rate-limited key', () => {
    expect(getChallengeErrorKey({ status: 429 })).toBe(
      'challenges.errors.rateLimited',
    )
  })

  it('prefers the rate-limit key over a specific error code on a 429', () => {
    expect(
      getChallengeErrorKey({ status: 429, errorCode: 'CHALLENGE_FULL' }),
    ).toBe('challenges.errors.rateLimited')
  })

  it('maps CHALLENGE_FULL to the challenge-full key', () => {
    expect(getChallengeErrorKey({ errorCode: 'CHALLENGE_FULL' })).toBe(
      'challenges.errors.challengeFull',
    )
  })

  it('maps ALREADY_JOINED_CHALLENGE to the already-joined key', () => {
    expect(
      getChallengeErrorKey({ errorCode: 'ALREADY_JOINED_CHALLENGE' }),
    ).toBe('challenges.errors.alreadyJoined')
  })

  it('maps CHALLENGE_CLOSED to the closed key', () => {
    expect(getChallengeErrorKey({ errorCode: 'CHALLENGE_CLOSED' })).toBe(
      'challenges.errors.closed',
    )
  })

  it('maps INVALID_JOIN_CODE to the invalid-code key', () => {
    expect(getChallengeErrorKey({ errorCode: 'INVALID_JOIN_CODE' })).toBe(
      'challenges.errors.invalidCode',
    )
  })

  it('falls back to the generic key for an unrecognized error code', () => {
    expect(getChallengeErrorKey({ errorCode: 'SOMETHING_ELSE' })).toBe(
      'challenges.errors.generic',
    )
  })

  it('falls back to the generic key when the error carries no usable metadata', () => {
    expect(getChallengeErrorKey(new Error('boom'))).toBe(
      'challenges.errors.generic',
    )
    expect(getChallengeErrorKey(null)).toBe('challenges.errors.generic')
  })
})
