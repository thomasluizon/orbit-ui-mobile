import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

const state = vi.hoisted(() => ({
  profile: undefined as Profile | undefined,
  setupChecklistDismissed: false,
  homeEntryDismissed: false,
  socialEntryDismissed: false,
  incomingRequestCount: 0,
  friendsEnabled: undefined as boolean | undefined,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: state.profile }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: (options?: { enabled?: boolean }) => {
    state.friendsEnabled = options?.enabled
    return {
      data: {
        friends: [],
        incomingRequests: Array.from(
          { length: state.incomingRequestCount },
          (_, index) => ({ id: `request-${index}` }),
        ),
        outgoingRequests: [],
      },
    }
  },
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: { setupChecklistDismissed: boolean }) => unknown) =>
    selector({ setupChecklistDismissed: state.setupChecklistDismissed }),
}))

vi.mock('@/stores/referral-prompt-store', () => ({
  useEngagementPromptStore: (
    selector: (s: {
      homeEntryDismissed: boolean
      socialEntryDismissed: boolean
    }) => unknown,
  ) =>
    selector({
      homeEntryDismissed: state.homeEntryDismissed,
      socialEntryDismissed: state.socialEntryDismissed,
    }),
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
    state.socialEntryDismissed = false
    state.incomingRequestCount = 0
    state.friendsEnabled = undefined
  })

  it('resolves the trial slot above every other card while the trial is active', () => {
    state.profile = createMockProfile({ isTrialActive: true })
    state.incomingRequestCount = 3

    expect(resolveSlot()).toBe('trial')
  })

  it('resolves the setup checklist before referral and social entry', () => {
    expect(resolveSlot()).toBe('setupChecklist')
  })

  it('keeps the setup checklist off non-today views', () => {
    expect(resolveSlot({ isTodayView: false, isTodayDate: true })).toBeNull()
  })

  it('falls past the mobile-only review reminder straight to referral when the checklist is dismissed', () => {
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

  it('falls to social entry when the referral home entry is dismissed', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true

    expect(resolveSlot()).toBe('socialEntry')
  })

  it('keeps social entry eligible for pending requests even after dismissal', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true
    state.socialEntryDismissed = true
    state.incomingRequestCount = 2

    expect(resolveSlot()).toBe('socialEntry')
  })

  it('resolves null when every card is dismissed and no requests are pending', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true
    state.socialEntryDismissed = true

    expect(resolveSlot()).toBeNull()
  })

  it('requires the today date for referral and social entry', () => {
    state.setupChecklistDismissed = true

    expect(resolveSlot({ isTodayView: true, isTodayDate: false })).toBeNull()
  })

  it('enables the friends query only when the profile opted into social', () => {
    resolveSlot()
    expect(state.friendsEnabled).toBe(false)

    state.profile = createMockProfile({ socialOptIn: true })
    resolveSlot()
    expect(state.friendsEnabled).toBe(true)
  })
})
