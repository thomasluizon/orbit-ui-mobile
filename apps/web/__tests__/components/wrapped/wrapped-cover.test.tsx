import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/gamification/ring-motif', () => ({
  RingMotif: ({ eyebrow, anchor }: { eyebrow: string; anchor: React.ReactNode }) => (
    <div>{eyebrow}{anchor}</div>
  ),
}))
vi.mock('@/components/ui/chip', () => ({
  Chip: ({ active, onClick, children, ariaLabel }: {
    active: boolean; onClick: () => void; children: React.ReactNode; ariaLabel: string
  }) => (
    <button type="button" aria-label={ariaLabel} aria-pressed={active} onClick={onClick}>{children}</button>
  ),
}))
vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ disabled, onClick, children, size = 'md', variant = 'primary' }: {
    disabled?: boolean; onClick: () => void; children: React.ReactNode; size?: string; variant?: string
  }) => <button type="button" disabled={disabled} onClick={onClick} data-size={size} data-variant={variant}>{children}</button>,
  PillButton: ({ disabled, onClick, children }: {
    disabled?: boolean; onClick: () => void; children: React.ReactNode
  }) => <button type="button" disabled={disabled} onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/ui/orbit-mark', () => ({ OrbitMark: () => <span data-testid="orbit-mark" /> }))
vi.mock('@/components/ui/icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}))
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ variant, rows, label }: { variant: string; rows: number; label: string }) => (
    <div role="progressbar" data-variant={variant} data-rows={rows} aria-label={label} />
  ),
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) => (
    <div role="alert"><span>{message}</span>{action}</div>
  ),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-styles', () => ({
  coverEyebrowStyle: {},
  coverTitleStyle: {},
  coverSubtitleStyle: {},
}))

import { WrappedCover } from '@/app/(app)/wrapped/_components/wrapped-cover'

const baseProps = {
  period: RECAP_SHARE_PERIODS[0]!,
  onSelectPeriod: vi.fn(),
  state: 'ready' as const,
  onStart: vi.fn(),
  onRetry: vi.fn(),
}

describe('WrappedCover', () => {
  it('renders the ready cover and starts the player', () => {
    const onSelectPeriod = vi.fn()
    const onStart = vi.fn()
    render(<WrappedCover {...baseProps} onSelectPeriod={onSelectPeriod} onStart={onStart} />)

    expect(screen.getByText('wrapped.coverTitles.week')).toBeInTheDocument()
    const periodGroup = screen.getByRole('group', { name: 'wrapped.periodGroup' })
    expect(within(periodGroup).getAllByRole('button')).toHaveLength(RECAP_SHARE_PERIODS.length)
    fireEvent.click(screen.getByRole('button', { name: `wrapped.periods.${RECAP_SHARE_PERIODS[1]}` }))
    expect(onSelectPeriod).toHaveBeenCalledWith(RECAP_SHARE_PERIODS[1])
    const start = screen.getByRole('button', { name: 'wrapped.start' })
    expect(start).not.toBeDisabled()
    fireEvent.click(start)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('renders the loading treatment without a Start action', () => {
    render(<WrappedCover {...baseProps} state="loading" />)

    const skeleton = screen.getByRole('progressbar', { name: 'wrapped.loading' })
    expect(skeleton).toHaveAttribute('data-variant', 'settings')
    expect(skeleton).toHaveAttribute('data-rows', '3')
    expect(screen.queryByRole('button', { name: 'wrapped.start' })).not.toBeInTheDocument()
  })

  it('renders the failed treatment and retries without showing Start', () => {
    const onRetry = vi.fn()
    render(<WrappedCover {...baseProps} state="failed" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('wrapped.error')
    const retry = screen.getByRole('button', { name: 'wrapped.retry' })
    expect(retry).toHaveAttribute('data-size', 'sm')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'wrapped.start' })).not.toBeInTheDocument()
  })

  it('renders the empty reason with a satellite and a visible disabled Start action', () => {
    render(<WrappedCover {...baseProps} state="empty" />)

    expect(screen.getByText('wrapped.empty')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="satellite"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'wrapped.start' })).toBeDisabled()
  })
})
