import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

const state = vi.hoisted(() => ({
  profile: undefined as Profile | undefined,
  setupChecklistDismissed: false,
  homeEntryDismissed: false,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: state.profile }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (store: { setupChecklistDismissed: boolean }) => unknown) =>
    selector({ setupChecklistDismissed: state.setupChecklistDismissed }),
}))

vi.mock('@/stores/referral-prompt-store', () => ({
  useEngagementPromptStore: (
    selector: (store: { homeEntryDismissed: boolean }) => unknown,
  ) => selector({ homeEntryDismissed: state.homeEntryDismissed }),
}))

import { useEngagementSlot } from '@/hooks/use-engagement-slot'

function resolveSlot(context = { isTodayView: true, isTodayDate: true }) {
  const { result } = renderHook(() => useEngagementSlot(context))
  return result.current.slot
}

describe('useEngagementSlot (web)', () => {
  beforeEach(() => {
    state.profile = createMockProfile()
    state.setupChecklistDismissed = false
    state.homeEntryDismissed = false
  })

  it('resolves the trial slot above every other card while the trial is active', () => {
    state.profile = createMockProfile({ isTrialActive: true })

    expect(resolveSlot()).toBe('trial')
  })

  it('resolves the setup checklist before referral', () => {
    expect(resolveSlot()).toBe('setupChecklist')
  })

  it('keeps the setup checklist off non-today views', () => {
    expect(resolveSlot({ isTodayView: false, isTodayDate: true })).toBeNull()
  })

  it('falls to referral when the checklist is dismissed', () => {
    state.setupChecklistDismissed = true

    expect(resolveSlot()).toBe('referral')
  })

  it('skips the setup checklist once it is completed server-side', () => {
    state.profile = createMockProfile({ hasCompletedOnboardingChecklist: true })

    expect(resolveSlot()).toBe('referral')
  })

  it('resolves referral while the profile is still loading', () => {
    state.profile = undefined

    expect(resolveSlot()).toBe('referral')
  })

  it('resolves null when the remaining entry is dismissed', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true

    expect(resolveSlot()).toBeNull()
  })

  it('requires the today date for the referral entry', () => {
    state.setupChecklistDismissed = true

    expect(resolveSlot({ isTodayView: true, isTodayDate: false })).toBeNull()
  })
})
