import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const refetch = vi.fn()
const goBackOrFallback = vi.fn()

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
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Ada' } }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => goBackOrFallback,
}))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: () => ({ ...mocks.wrapped, refetch }),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-cover', () => ({
  WrappedCover: ({ period, onSelectPeriod, onStart, state }: {
    period: string; onSelectPeriod: (p: string) => void; onStart: () => void; state: string
  }) => (
    <div>
      <span data-testid="period">{period}</span>
      <span data-testid="cover-state">{state}</span>
      <button type="button" aria-label="month" onClick={() => onSelectPeriod('month')} />
      <button type="button" aria-label="start" onClick={onStart} />
    </div>
  ),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-player', () => ({
  WrappedPlayer: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="player">
      <button type="button" aria-label="close-player" onClick={onClose} />
    </div>
  ),
}))

import WrappedPage from '@/app/(app)/wrapped/page'

describe('WrappedPage', () => {
  beforeEach(() => {
    refetch.mockClear()
    goBackOrFallback.mockClear()
    mocks.wrapped = { recap: { id: 'recap-1' }, slides: [], isEmpty: false, isLoading: false, isError: false }
  })

  it('starts on the week period with the ready cover', () => {
    render(<WrappedPage />)
    expect(screen.getByTestId('period')).toHaveTextContent('week')
    expect(screen.getByTestId('cover-state')).toHaveTextContent('ready')
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

  it('keeps an empty recap on the empty cover and refuses to open the player', () => {
    mocks.wrapped = { recap: { id: 'recap-empty' }, slides: [], isEmpty: true, isLoading: false, isError: false }
    render(<WrappedPage />)
    expect(screen.getByTestId('cover-state')).toHaveTextContent('empty')
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('keeps a missing paused recap non-actionable', () => {
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: false }
    render(<WrappedPage />)
    expect(screen.getByTestId('cover-state')).toHaveTextContent('loading')
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('provides exactly one main landmark', () => {
    render(<WrappedPage />)
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('exits the cover to Profile while player close only returns to the cover', () => {
    render(<WrappedPage />)

    fireEvent.click(screen.getByRole('button', { name: 'common.backToProfile' }))
    expect(goBackOrFallback).toHaveBeenCalledExactlyOnceWith('/profile')

    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    fireEvent.click(screen.getByRole('button', { name: 'close-player' }))
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    expect(goBackOrFallback).toHaveBeenCalledTimes(1)
  })
})
