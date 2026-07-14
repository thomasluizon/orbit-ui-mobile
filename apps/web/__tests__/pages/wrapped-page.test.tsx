import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const goBack = vi.fn()
const refetch = vi.fn()

const mocks = vi.hoisted(() => ({
  wrapped: {
    recap: { id: 'recap-1' } as unknown,
    slides: [] as unknown[],
    isEmpty: false,
    isLoading: false,
    isError: false,
  },
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => goBack }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Ada' } }) }))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: () => ({ ...mocks.wrapped, refetch }),
}))
vi.mock('@/components/ui/app-bar', () => ({
  AppBar: ({ onBack }: { onBack: () => void }) => (
    <button type="button" aria-label="back" onClick={onBack} />
  ),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-cover', () => ({
  WrappedCover: ({ period, onSelectPeriod, onStart, canStart }: {
    period: string; onSelectPeriod: (p: string) => void; onStart: () => void; canStart: boolean
  }) => (
    <div>
      <span data-testid="period">{period}</span>
      <span data-testid="can-start">{String(canStart)}</span>
      <button type="button" aria-label="month" onClick={() => onSelectPeriod('month')} />
      <button type="button" aria-label="start" onClick={onStart} />
    </div>
  ),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-player', () => ({
  WrappedPlayer: () => <div data-testid="player" />,
}))

import WrappedPage from '@/app/(app)/wrapped/page'

describe('WrappedPage', () => {
  beforeEach(() => {
    goBack.mockClear()
    refetch.mockClear()
    mocks.wrapped = { recap: { id: 'recap-1' }, slides: [], isEmpty: false, isLoading: false, isError: false }
  })

  it('starts on the week period and enables start once a recap is loaded', () => {
    render(<WrappedPage />)
    expect(screen.getByTestId('period')).toHaveTextContent('week')
    expect(screen.getByTestId('can-start')).toHaveTextContent('true')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('opens the player only after Start is pressed with a recap present', () => {
    render(<WrappedPage />)
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('changing the period stops playback and switches the fetched period', () => {
    render(<WrappedPage />)
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    expect(screen.getByTestId('player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'month' }))
    expect(screen.getByTestId('period')).toHaveTextContent('month')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('disables start when the recap is empty', () => {
    mocks.wrapped = { recap: null, slides: [], isEmpty: true, isLoading: false, isError: false }
    render(<WrappedPage />)
    expect(screen.getByTestId('can-start')).toHaveTextContent('false')
  })

  it('routes back through the go-back fallback', () => {
    render(<WrappedPage />)
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(goBack).toHaveBeenCalledWith('/profile')
  })
})
