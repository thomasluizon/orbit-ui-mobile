import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockChallengeDetail } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({
  detailReturn: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  leaveMutate: vi.fn(),
  setHabitsMutate: vi.fn(),
  onLeft: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  useLocale: () => 'en',
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm?: () => void }) =>
    open ? (
      <button type="button" data-testid="confirm-leave" onClick={onConfirm}>
        confirm
      </button>
    ) : null,
}))

vi.mock('@/hooks/use-challenges', () => ({
  useChallengeDetail: () => mocks.detailReturn,
  useLeaveChallenge: () => ({ mutateAsync: mocks.leaveMutate, isPending: false }),
  useSetChallengeHabits: () => ({ mutateAsync: mocks.setHabitsMutate, isPending: false }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { topLevelHabits: [{ id: 'h-1', title: 'Read' }] } }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

import { ChallengeDetail } from '@/app/(app)/social/challenges/_components/challenge-detail'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.detailReturn.isLoading = false
  mocks.detailReturn.isError = false
  mocks.leaveMutate.mockResolvedValue(null)
  mocks.setHabitsMutate.mockResolvedValue(null)
})

describe('ChallengeDetail', () => {
  it('renders a CoopGoal shared progress bar bound to currentProgress/targetCount', () => {
    mocks.detailReturn.data = createMockChallengeDetail({
      type: 'CoopGoal',
      currentProgress: 12,
      targetCount: 30,
    })

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(screen.getByText('12 / 30')).toBeInTheDocument()
  })

  it('shows a retryable error state instead of not-found when the query fails', () => {
    mocks.detailReturn.data = undefined
    mocks.detailReturn.isError = true

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    expect(screen.getByText('challenges.errors.loadFailed')).toBeInTheDocument()
    expect(screen.queryByText('challenges.detail.notFound')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(mocks.detailReturn.refetch).toHaveBeenCalled()
  })

  it('exposes an accessible edit affordance for linked habits', () => {
    mocks.detailReturn.data = createMockChallengeDetail({ yourLinkedHabitIds: ['h-1'] })

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    expect(
      screen.getByRole('button', { name: 'challenges.detail.editHabits' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('challenges.detail.linkHabitsCta')).not.toBeInTheDocument()
  })

  it('renders a StreakTogether shared-streak counter and no progress bar', () => {
    mocks.detailReturn.data = createMockChallengeDetail({
      type: 'StreakTogether',
      currentProgress: 5,
      targetCount: null,
      periodEndUtc: null,
      yourLinkedHabitIds: ['h-1'],
    })

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    expect(screen.getByTestId('challenge-streak-count')).toHaveTextContent('5')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows members by name only, with no per-person numbers', () => {
    mocks.detailReturn.data = createMockChallengeDetail({
      participants: [
        { userId: 'u1', name: 'Ada', joinedAtUtc: '2026-03-01T00:00:00Z' },
        { userId: 'u2', name: 'Grace', joinedAtUtc: '2026-03-02T00:00:00Z' },
      ],
    })

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    const members = screen.getByTestId('challenge-members')
    expect(members).toHaveTextContent('Ada')
    expect(members).toHaveTextContent('Grace')
    expect(members.textContent ?? '').not.toMatch(/[0-9]/)
  })

  it('shows the link-habits CTA when the user has none linked and saves the selection', async () => {
    mocks.detailReturn.data = createMockChallengeDetail({ yourLinkedHabitIds: [] })

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    fireEvent.click(screen.getByText('challenges.detail.linkHabitsCta'))
    fireEvent.click(screen.getByText('Read'))
    fireEvent.click(screen.getByText('common.save'))

    await vi.waitFor(() => {
      expect(mocks.setHabitsMutate).toHaveBeenCalledWith({ challengeId: 'c-1', habitIds: ['h-1'] })
    })
  })

  it('leaves the challenge after confirmation', async () => {
    mocks.detailReturn.data = createMockChallengeDetail({ yourLinkedHabitIds: ['h-1'] })

    render(<ChallengeDetail challengeId="c-1" onLeft={mocks.onLeft} />)

    fireEvent.click(screen.getByText('challenges.detail.leave'))
    fireEvent.click(screen.getByTestId('confirm-leave'))

    await vi.waitFor(() => {
      expect(mocks.leaveMutate).toHaveBeenCalledWith('c-1')
    })
  })
})
