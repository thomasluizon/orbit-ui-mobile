import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    title,
  }: {
    open: boolean
    children?: React.ReactNode
    title?: string
    onOpenChange?: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="referral-prompt">
        {title}
        {children}
      </div>
    ) : null,
}))

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: ({ open }: { open: boolean; onOpenChange?: (open: boolean) => void }) =>
    open ? <div data-testid="referral-drawer" /> : null,
}))

import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

function resetStores() {
  useReferralPromptStore.setState({
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedPrompt: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
}

async function arm(milestoneKey: string) {
  await act(async () => {
    useReferralPromptStore.getState().armReferralPrompt(milestoneKey)
    await Promise.resolve()
  })
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('ReferralPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders nothing when no milestone is armed', () => {
    render(<ReferralPrompt />)
    expect(screen.queryByTestId('referral-prompt')).toBeNull()
  })

  it('shows the prompt after the settle delay and marks it prompted', async () => {
    render(<ReferralPrompt />)
    await arm('streak-7')
    expect(screen.queryByTestId('referral-prompt')).toBeNull()

    await settle()

    expect(screen.getByTestId('referral-prompt')).toBeInTheDocument()
    expect(useReferralPromptStore.getState().promptedMilestoneKeys).toContain(
      'streak-7',
    )
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    render(<ReferralPrompt />)
    await arm('streak-7')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('referral-prompt')).toBeNull()
  })

  it('stays hidden and clears the arm when the milestone was already prompted', async () => {
    useReferralPromptStore.setState({ promptedMilestoneKeys: ['streak-7'] })
    render(<ReferralPrompt />)
    await arm('streak-7')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('referral-prompt')).toBeNull()
    expect(useReferralPromptStore.getState().armedPrompt).toBeNull()
  })

  it('does not render when a milestone-share prompt is armed', async () => {
    render(<ReferralPrompt />)
    await act(async () => {
      useReferralPromptStore.getState().armMilestoneSharePrompt('share-streak-7')
      await Promise.resolve()
    })

    await settle()

    expect(screen.queryByTestId('referral-prompt')).toBeNull()
  })

  it('opens the drawer from the CTA', async () => {
    render(<ReferralPrompt />)
    await arm('level-3')
    await settle()

    fireEvent.click(screen.getByText('referral.prompt.cta'))

    expect(screen.queryByTestId('referral-prompt')).toBeNull()
    expect(screen.getByTestId('referral-drawer')).toBeInTheDocument()
  })

  it('dismisses without opening the drawer from "maybe later"', async () => {
    render(<ReferralPrompt />)
    await arm('streak-100')
    await settle()

    fireEvent.click(screen.getByText('referral.prompt.later'))

    expect(screen.queryByTestId('referral-prompt')).toBeNull()
    expect(screen.queryByTestId('referral-drawer')).toBeNull()
  })
})
