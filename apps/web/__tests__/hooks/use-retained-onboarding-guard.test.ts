import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { act, renderHook } from '@testing-library/react'
import { holdAccount, replaceAccountWith, resetAuthStore } from '@/__tests__/support/account-change'
import { useRetainedOnboardingGuard, useRetainedOnboardingSession } from '@/hooks/use-retained-onboarding-guard'

const unfinished = createMockProfile({ hasCompletedOnboarding: false })
const finished = createMockProfile({ hasCompletedOnboarding: true })

describe('retained onboarding account decision', () => {
  it('shows onboarding whenever the account flag is false', () => {
    expect(useRetainedOnboardingGuard(unfinished, false)).toBe(true)
  })

  it('waits for the profile and buffered answers', () => {
    expect(useRetainedOnboardingGuard(undefined, false)).toBe(false)
    expect(useRetainedOnboardingGuard(null, false)).toBe(false)
    expect(useRetainedOnboardingGuard(unfinished, true)).toBe(false)
  })

  it('does not show onboarding for an onboarded account', () => {
    expect(useRetainedOnboardingGuard(finished, false)).toBe(false)
  })

  it('keeps deferred push recovery available after onboarding was applied', () => {
    expect(useRetainedOnboardingGuard(finished, true, true)).toBe(true)
  })
})

describe('retained onboarding source lifetime', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(async () => { await resetAuthStore(); vi.unstubAllGlobals() })

  it('admits a delayed profile, keeps the source through completion, and releases it on exit', () => {
    const { result, rerender } = renderHook(({ required }) => useRetainedOnboardingSession(required), { initialProps: { required: false } })
    expect(result.current.open).toBe(false)
    rerender({ required: true })
    expect(result.current.open).toBe(true)
    rerender({ required: false })
    expect(result.current.open).toBe(true)
    act(() => result.current.dismiss())
    expect(result.current.open).toBe(false)
    rerender({ required: true })
    expect(result.current.open).toBe(false)
  })

  it('drops admission when another account no longer owes onboarding', async () => {
    holdAccount('source-account')
    const { result, rerender } = renderHook(({ required }) => useRetainedOnboardingSession(required), { initialProps: { required: true } })
    expect(result.current.open).toBe(true)
    rerender({ required: false })
    expect(result.current.open).toBe(true)
    await act(async () => { await replaceAccountWith('completed-account') })
    expect(result.current.open).toBe(false)
    rerender({ required: true })
    expect(result.current.open).toBe(true)
  })
})
