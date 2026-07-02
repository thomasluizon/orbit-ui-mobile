import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockChallengeListItem, createMockProfile } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({
  profileReturn: { profile: undefined as unknown, isLoading: false },
  challengesReturn: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  createMutate: vi.fn(),
  joinMutate: vi.fn(),
  searchCode: null as string | null,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => mocks.searchCode }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => mocks.profileReturn }))

vi.mock('@/hooks/use-challenges', () => ({
  useChallenges: () => mocks.challengesReturn,
  useCreateChallenge: () => ({ mutateAsync: mocks.createMutate, isPending: false }),
  useJoinChallenge: () => ({ mutateAsync: mocks.joinMutate, isPending: false }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { topLevelHabits: [] } }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => ({ data: { friends: [] } }),
  useSetHandle: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetSocialOptIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

import ChallengesPage from '@/app/(app)/social/challenges/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profileReturn.profile = createMockProfile({ socialOptIn: true, handle: 'me' })
  mocks.profileReturn.isLoading = false
  mocks.challengesReturn.data = []
  mocks.challengesReturn.isError = false
  mocks.searchCode = null
  mocks.createMutate.mockResolvedValue({ id: 'c-new' })
  mocks.joinMutate.mockResolvedValue(null)
})

describe('ChallengesPage', () => {
  it('renders the opt-in gate when social is not enabled', () => {
    mocks.profileReturn.profile = createMockProfile({ socialOptIn: false, handle: 'me' })

    render(<ChallengesPage />)

    expect(screen.getByText('social.optInGate.title')).toBeInTheDocument()
    expect(screen.queryByText('challenges.actions.create')).not.toBeInTheDocument()
  })

  it('shows the empty state with create and join CTAs', () => {
    render(<ChallengesPage />)

    expect(screen.getByText('challenges.empty.title')).toBeInTheDocument()
    expect(screen.getByText('challenges.empty.create')).toBeInTheDocument()
    expect(screen.getByText('challenges.empty.join')).toBeInTheDocument()
  })

  it('renders a labelled loading indicator while the profile loads', () => {
    mocks.profileReturn.profile = undefined
    mocks.profileReturn.isLoading = true

    render(<ChallengesPage />)

    expect(screen.getByRole('status', { name: 'common.loading' })).toBeInTheDocument()
    expect(screen.queryByText('challenges.empty.title')).not.toBeInTheDocument()
  })

  it('shows a retryable error state when the challenges query fails', () => {
    mocks.challengesReturn.isError = true

    render(<ChallengesPage />)

    expect(screen.getByText('challenges.errors.loadFailed')).toBeInTheDocument()
    expect(screen.queryByText('challenges.empty.title')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(mocks.challengesReturn.refetch).toHaveBeenCalled()
  })

  it('surfaces inline field errors when the create form is submitted empty', async () => {
    render(<ChallengesPage />)

    fireEvent.click(screen.getByText('challenges.actions.create'))
    fireEvent.click(screen.getByRole('button', { name: 'challenges.create.submit' }))

    expect(await screen.findByText('challenges.create.errors.titleRequired')).toBeInTheDocument()
    expect(screen.getByText('challenges.create.errors.targetInvalid')).toBeInTheDocument()
    expect(screen.getByText('challenges.create.errors.endDateRequired')).toBeInTheDocument()
  })

  it('partitions active and completed challenges into sections', () => {
    mocks.challengesReturn.data = [
      createMockChallengeListItem({ id: 'a', title: 'Active One', status: 'Active' }),
      createMockChallengeListItem({ id: 'b', title: 'Done One', status: 'Completed' }),
    ]

    render(<ChallengesPage />)

    expect(screen.getByText('challenges.sections.active')).toBeInTheDocument()
    expect(screen.getByText('challenges.sections.completed')).toBeInTheDocument()
    expect(screen.getByText('Active One')).toBeInTheDocument()
    expect(screen.getByText('Done One')).toBeInTheDocument()
  })

  it('branches the create form by type: CoopGoal shows target + end date, StreakTogether hides them', () => {
    render(<ChallengesPage />)

    fireEvent.click(screen.getByText('challenges.actions.create'))

    expect(screen.getByText('challenges.create.targetLabel')).toBeInTheDocument()
    expect(screen.getByText('challenges.create.endDateLabel')).toBeInTheDocument()

    fireEvent.click(screen.getByText('challenges.type.streakTogether'))

    expect(screen.queryByText('challenges.create.targetLabel')).not.toBeInTheDocument()
    expect(screen.queryByText('challenges.create.endDateLabel')).not.toBeInTheDocument()
  })

  it('joins a challenge with the entered code and no linked habits', async () => {
    render(<ChallengesPage />)

    fireEvent.click(screen.getByText('challenges.actions.join'))
    fireEvent.change(screen.getByLabelText('challenges.join.codeLabel'), {
      target: { value: 'ABCD1234' },
    })
    fireEvent.click(screen.getByText('challenges.join.submit'))

    await vi.waitFor(() => {
      expect(mocks.joinMutate).toHaveBeenCalledWith({ code: 'ABCD1234', linkedHabitIds: [] })
    })
  })
})
