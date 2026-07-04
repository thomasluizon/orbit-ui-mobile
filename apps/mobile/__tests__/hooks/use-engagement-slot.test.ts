import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

import { useEngagementSlot } from '@/hooks/use-engagement-slot'

const TestRenderer = require('react-test-renderer')

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

function renderEngagementSlot(
  context = { isTodayView: true, isTodayDate: true },
) {
  let result: ReturnType<typeof useEngagementSlot> | undefined
  function Probe() {
    result = useEngagementSlot(context)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  if (!result) {
    throw new Error('Expected hook to render')
  }
  return result
}

describe('useEngagementSlot (mobile)', () => {
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

    expect(renderEngagementSlot().slot).toBe('trial')
  })

  it('resolves the setup checklist before referral and social entry', () => {
    state.incomingRequestCount = 3

    expect(renderEngagementSlot().slot).toBe('setupChecklist')
  })

  it('falls to referral when the checklist is dismissed', () => {
    state.setupChecklistDismissed = true

    expect(renderEngagementSlot().slot).toBe('referral')
  })

  it('falls to social entry when the referral home entry is dismissed', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true

    expect(renderEngagementSlot().slot).toBe('socialEntry')
  })

  it('keeps social entry eligible for pending requests even after dismissal', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true
    state.socialEntryDismissed = true
    state.incomingRequestCount = 2

    expect(renderEngagementSlot().slot).toBe('socialEntry')
  })

  it('resolves null when every card is dismissed and no requests are pending', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true
    state.socialEntryDismissed = true

    expect(renderEngagementSlot().slot).toBeNull()
  })

  it('requires the today date for referral and social entry', () => {
    state.setupChecklistDismissed = true

    expect(
      renderEngagementSlot({ isTodayView: true, isTodayDate: false }).slot,
    ).toBeNull()
  })

  it('enables the friends query only when the profile opted into social', () => {
    renderEngagementSlot()
    expect(state.friendsEnabled).toBe(false)

    state.profile = createMockProfile({ socialOptIn: true })
    renderEngagementSlot()
    expect(state.friendsEnabled).toBe(true)
  })
})
