import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    onOpenChange,
    children,
    footer,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children?: React.ReactNode
    footer?: React.ReactNode
  }) =>
    open ? (
      <div>
        {children}
        {footer}
        <button type="button" onClick={() => onOpenChange(false)}>
          overlay-close
        </button>
      </div>
    ) : null,
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => ({
    data: { friends: [{ userId: 'friend-1', displayName: 'Ana Lima', handle: 'ana' }] },
  }),
}))

vi.mock('@/hooks/use-accountability', () => ({
  useInviteAccountabilityBuddy: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

vi.mock('@/hooks/use-habits', () => ({
  EMPTY_CHILDREN_BY_PARENT: new Map(),
  EMPTY_HABITS_BY_ID: new Map(),
  EMPTY_NORMALIZED_HABITS: [],
  useHabits: () => ({ data: undefined }),
}))

import { NewPairFlow } from '@/app/(app)/social/_components/new-pair-flow'

const onOpenChange = vi.fn()

beforeEach(() => {
  onOpenChange.mockClear()
})

describe('NewPairFlow', () => {
  it('keeps the draft selections while the overlay stays open', () => {
    render(<NewPairFlow open onOpenChange={onOpenChange} />)

    const weekly = screen.getByRole('button', { name: 'social.buddies.cadence.Weekly' })
    expect(weekly).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(weekly)

    expect(weekly).toHaveAttribute('aria-pressed', 'true')
  })

  it('resets the draft when the overlay closes without submitting', () => {
    render(<NewPairFlow open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'social.buddies.cadence.Weekly' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ana Lima' }))
    expect(screen.getByRole('button', { name: 'Ana Lima' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'overlay-close' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'social.buddies.cadence.Weekly' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'social.buddies.cadence.Daily' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Ana Lima' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
