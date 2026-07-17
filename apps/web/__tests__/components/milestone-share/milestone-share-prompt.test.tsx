import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

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
  }: {
    open: boolean
    children?: React.ReactNode
    onOpenChange?: (open: boolean) => void
  }) => (open ? <div data-testid="milestone-share-prompt">{children}</div> : null),
}))

vi.mock('@/components/milestone-share/milestone-share-card', () => ({
  MilestoneShareCard: function MilestoneShareCard({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
    return <div ref={ref} data-testid="milestone-share-card" />
  },
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null },
    isSharing: false,
    hasError: false,
    canShareFiles: false,
    share: vi.fn(),
    download: vi.fn(),
  }),
}))

import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

function resetStores() {
  useEngagementPromptStore.setState({
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedPrompt: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
}

async function armMilestoneShare(milestoneKey: string) {
  await act(async () => {
    useEngagementPromptStore.getState().armMilestoneSharePrompt(milestoneKey)
    await Promise.resolve()
  })
}

async function armReferral(milestoneKey: string) {
  await act(async () => {
    useEngagementPromptStore.getState().armReferralPrompt(milestoneKey)
    await Promise.resolve()
  })
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('MilestoneSharePrompt', () => {
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
    render(<MilestoneSharePrompt />)
    expect(screen.queryByTestId('milestone-share-prompt')).toBeNull()
  })

  it('renders nothing when a referral prompt is armed (kind isolation)', async () => {
    render(<MilestoneSharePrompt />)
    await armReferral('level-3')

    await settle()

    expect(screen.queryByTestId('milestone-share-prompt')).toBeNull()
  })

  it('shows the card after the settle delay and marks it prompted', async () => {
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    expect(screen.queryByTestId('milestone-share-prompt')).toBeNull()

    await settle()

    expect(screen.getByTestId('milestone-share-prompt')).toBeInTheDocument()
    expect(screen.getByTestId('milestone-share-card')).toBeInTheDocument()
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain(
      'share-streak-7',
    )
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('milestone-share-prompt')).toBeNull()
  })

  it('stays hidden and clears the arm when the milestone was already prompted', async () => {
    useEngagementPromptStore.setState({ promptedMilestoneKeys: ['share-streak-7'] })
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('milestone-share-prompt')).toBeNull()
    expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  })
})
