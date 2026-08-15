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
  if (!result) throw new Error('Expected hook to render')
  return result
}

describe('useEngagementSlot (mobile)', () => {
  beforeEach(() => {
    state.profile = createMockProfile()
    state.setupChecklistDismissed = false
    state.homeEntryDismissed = false
  })

  it('resolves the trial slot above every other card while the trial is active', () => {
    state.profile = createMockProfile({ isTrialActive: true })

    expect(renderEngagementSlot().slot).toBe('trial')
  })

  it('resolves the setup checklist before referral', () => {
    expect(renderEngagementSlot().slot).toBe('setupChecklist')
  })

  it('falls to referral when the checklist is dismissed', () => {
    state.setupChecklistDismissed = true

    expect(renderEngagementSlot().slot).toBe('referral')
  })

  it('resolves null when the remaining entry is dismissed', () => {
    state.setupChecklistDismissed = true
    state.homeEntryDismissed = true

    expect(renderEngagementSlot().slot).toBeNull()
  })

  it('requires the today date for the referral entry', () => {
    state.setupChecklistDismissed = true

    expect(
      renderEngagementSlot({ isTodayView: true, isTodayDate: false }).slot,
    ).toBeNull()
  })
})
