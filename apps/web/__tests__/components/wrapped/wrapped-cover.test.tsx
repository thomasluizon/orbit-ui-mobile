import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  PillButton: ({ disabled, onClick, children }: {
    disabled?: boolean; onClick: () => void; children: React.ReactNode
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>{children}</button>
  ),
}))
vi.mock('@/components/ui/satellite-glyph', () => ({ SatelliteGlyph: () => <span data-testid="glyph" /> }))
vi.mock('@/app/(app)/wrapped/_components/wrapped-styles', () => ({ coverTitleStyle: {}, coverSubtitleStyle: {} }))

import { WrappedCover } from '@/app/(app)/wrapped/_components/wrapped-cover'

const baseProps = {
  period: RECAP_SHARE_PERIODS[0]!,
  onSelectPeriod: vi.fn(),
  isLoading: false,
  isError: false,
  isEmpty: false,
  canStart: true,
  onStart: vi.fn(),
  onRetry: vi.fn(),
}

describe('WrappedCover', () => {
  it('renders a period chip per supported period and forwards the selection', () => {
    const onSelectPeriod = vi.fn()
    render(<WrappedCover {...baseProps} onSelectPeriod={onSelectPeriod} />)
    const chips = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
    expect(chips.length).toBeGreaterThanOrEqual(RECAP_SHARE_PERIODS.length)
    fireEvent.click(screen.getByRole('button', { name: `wrapped.periods.${RECAP_SHARE_PERIODS[1]}` }))
    expect(onSelectPeriod).toHaveBeenCalledWith(RECAP_SHARE_PERIODS[1])
  })

  it('enables Start and fires onStart when data is ready', () => {
    const onStart = vi.fn()
    render(<WrappedCover {...baseProps} canStart onStart={onStart} />)
    const start = screen.getByRole('button', { name: 'wrapped.start' })
    expect(start).not.toBeDisabled()
    fireEvent.click(start)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('disables Start and shows the loading hint while fetching', () => {
    render(<WrappedCover {...baseProps} isLoading canStart={false} />)
    expect(screen.getByRole('button', { name: 'wrapped.start' })).toBeDisabled()
    expect(screen.getByText('wrapped.loading')).toBeInTheDocument()
    expect(screen.queryByText('wrapped.empty')).not.toBeInTheDocument()
  })

  it('shows a retryable error and calls onRetry', () => {
    const onRetry = vi.fn()
    render(<WrappedCover {...baseProps} isError canStart={false} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('wrapped.error')
    fireEvent.click(screen.getByRole('button', { name: 'wrapped.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state only when not loading and not errored', () => {
    render(<WrappedCover {...baseProps} isEmpty canStart={false} />)
    expect(screen.getByText('wrapped.empty')).toBeInTheDocument()
    expect(screen.getByTestId('glyph')).toBeInTheDocument()
    expect(screen.queryByText('wrapped.loading')).not.toBeInTheDocument()
  })
})
