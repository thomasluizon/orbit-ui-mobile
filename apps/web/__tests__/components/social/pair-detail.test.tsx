import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const showSuccess = vi.fn()
const showError = vi.fn()
const checkInMutate = vi.fn()
const setHabitsMutate = vi.fn()
const endMutate = vi.fn()

const mocks = vi.hoisted(() => ({
  pairs: { activePairs: [] as unknown[] },
  checkIns: { isPending: false, data: { items: [] as unknown[] } },
  habitsById: new Map<string, { title: string }>(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => (params ? `${key}(${JSON.stringify(params)})` : key),
  useLocale: () => 'en',
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess, showError }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: mocks.habitsById } }) }))
vi.mock('@/hooks/use-accountability', () => ({
  useAccountabilityPairs: () => ({ data: mocks.pairs }),
  useAccountabilityCheckIns: () => mocks.checkIns,
  useCheckInAccountability: () => ({ mutateAsync: checkInMutate, isPending: false }),
  useSetAccountabilityHabits: () => ({ mutateAsync: setHabitsMutate, isPending: false }),
  useEndAccountabilityPair: () => ({ mutateAsync: endMutate, isPending: false }),
}))
vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, footer, title }: {
    open: boolean; children: React.ReactNode; footer?: React.ReactNode; title?: string
  }) => (open ? <div data-testid="overlay">{title}{children}{footer}</div> : null),
}))
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    (open ? <button type="button" aria-label="confirm-unpair" onClick={onConfirm} /> : null),
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) => (
    <button type="button" disabled={disabled} onClick={onClick}>{children}</button>
  ),
}))
vi.mock('@/components/ui/section-label', () => ({
  SectionLabel: ({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) => <div>{children}{trailing}</div>,
}))
vi.mock('@/app/(app)/social/_components/habit-multi-select', () => ({ HabitMultiSelect: () => <div data-testid="multi-select" /> }))

import { PairDetail } from '@/app/(app)/social/_components/pair-detail'

function makePair(overrides: Partial<AccountabilityPair> = {}): AccountabilityPair {
  return {
    id: 'p-1',
    buddy: { userId: 'u-2', handle: 'buddy', displayName: 'Ada' },
    cadence: 'Daily',
    status: 'Accepted',
    isInitiatedByMe: true,
    myHabitIds: ['h-1'],
    buddyHabitIds: ['h-9', 'h-8'],
    myLastCheckInDate: null,
    buddyLastCheckInDate: null,
    createdAtUtc: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('PairDetail', () => {
  beforeEach(() => {
    showSuccess.mockClear()
    showError.mockClear()
    checkInMutate.mockReset()
    setHabitsMutate.mockReset()
    endMutate.mockReset()
    mocks.pairs = { activePairs: [makePair()] }
    mocks.checkIns = { isPending: false, data: { items: [] } }
    mocks.habitsById = new Map([['h-1', { title: 'Meditate' } as NormalizedHabit]])
  })

  it('shows the not-found copy when the pair is missing', () => {
    mocks.pairs = { activePairs: [] }
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    expect(screen.getByText('social.buddies.detail.notFound')).toBeInTheDocument()
  })

  it('renders the buddy habit count and the resolved habit titles', () => {
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Meditate')).toBeInTheDocument()
  })

  it('checks in with the trimmed note and clears it on success', async () => {
    checkInMutate.mockResolvedValue(undefined)
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    const note = screen.getByLabelText('social.buddies.checkInNotePlaceholder')
    fireEvent.change(note, { target: { value: '  keep going  ' } })
    fireEvent.click(screen.getByText('social.buddies.checkInSubmit'))
    await waitFor(() => expect(checkInMutate).toHaveBeenCalledWith({ pairId: 'p-1', note: 'keep going' }))
    expect(showSuccess).toHaveBeenCalledWith('social.buddies.checkInSuccess')
  })

  it('surfaces an error toast when the check-in fails', async () => {
    checkInMutate.mockRejectedValue(new Error('offline'))
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('social.buddies.checkInSubmit'))
    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1))
  })

  it('hides the check-in form once already checked in today', () => {
    mocks.pairs = { activePairs: [makePair({ myLastCheckInDate: formatAPIDate(new Date()) })] }
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    expect(screen.getByText('social.buddies.checkedInLabel')).toBeInTheDocument()
    expect(screen.queryByText('social.buddies.checkInSubmit')).not.toBeInTheDocument()
  })

  it('saves edited habits from the edit overlay', async () => {
    setHabitsMutate.mockResolvedValue(undefined)
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'social.buddies.detail.editHabits' }))
    fireEvent.click(screen.getByText('common.save'))
    await waitFor(() => expect(setHabitsMutate).toHaveBeenCalledWith({ pairId: 'p-1', habitIds: ['h-1'] }))
    expect(showSuccess).toHaveBeenCalledWith('social.buddies.detail.editSuccess')
  })

  it('unpairs after confirmation and closes the detail', async () => {
    endMutate.mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<PairDetail pairId="p-1" onClose={onClose} />)
    fireEvent.click(screen.getByText('social.buddies.detail.unpair'))
    fireEvent.click(screen.getByRole('button', { name: 'confirm-unpair' }))
    await waitFor(() => expect(endMutate).toHaveBeenCalledWith('p-1'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders check-in history rows when present', () => {
    mocks.checkIns = { isPending: false, data: { items: [{ id: 'c-1', displayName: 'Ada', date: '2026-02-01', note: 'done' }] } }
    render(<PairDetail pairId="p-1" onClose={vi.fn()} />)
    expect(screen.getByText('done')).toBeInTheDocument()
  })
})
