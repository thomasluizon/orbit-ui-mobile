import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'

const refetch = vi.fn()
const goBackOrFallback = vi.fn()

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useWrapped: vi.fn(),
  wrapped: {
    recap: { id: 'recap-1' } as unknown,
    slides: [] as unknown[],
    isEmpty: false,
    isLoading: false,
    isError: false,
  },
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Ada' } }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => goBackOrFallback,
}))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: (...args: unknown[]) => {
    mocks.useWrapped(...args)
    return { ...mocks.wrapped, refetch }
  },
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-cover', () => ({
  WrappedCover: ({ period, onSelectPeriod, onStart, state }: {
    period: string; onSelectPeriod: (p: string) => void; onStart: () => void; state: string
  }) => (
    <div>
      <span data-testid="period">{period}</span>
      <span data-testid="cover-state">{state}</span>
      <button type="button" aria-label="month" onClick={() => onSelectPeriod('month')} />
      <button type="button" aria-label="week" onClick={() => onSelectPeriod('week')} />
      <button type="button" aria-label="start" onClick={onStart} />
    </div>
  ),
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-player', () => ({
  WrappedPlayer: ({ onClose, notice }: { onClose: () => void; notice?: React.ReactNode }) => (
    <div role="dialog" aria-modal="true" aria-label="Wrapped" data-testid="player">
      <button type="button" aria-label="close-player" onClick={onClose} />
      <div data-shell-notice="">{notice}</div>
      <div data-testid="wrapped-pager">Pager</div>
    </div>
  ),
}))

import WrappedPage from '@/app/(app)/wrapped/page'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useVersionGateStore } from '@/stores/version-gate-store'

describe('WrappedPage', () => {
  beforeEach(() => {
    refetch.mockClear()
    goBackOrFallback.mockClear()
    mocks.searchParams = new URLSearchParams()
    mocks.useWrapped.mockClear()
    mocks.wrapped = { recap: { id: 'recap-1' }, slides: [], isEmpty: false, isLoading: false, isError: false }
    useAppToastStore.setState({ currentToast: null, queue: [] })
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
  })

  it('keeps the reload guidance on the cover and inside the player', async () => {
    useVersionGateStore.getState().requireReload('appUpdated')
    render(<WrappedPage />)
    await act(async () => {})

    expect(screen.getByRole('status')).toHaveTextContent('errors.api.appUpdated')

    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.getByTestId('player')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('errors.api.appUpdated')
  })

  it('keeps the version banner dismissed when the player opens', async () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(<WrappedPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'versionUpdate.laterCta' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.getByTestId('player')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('starts on the week period with the ready cover', async () => {
    render(<WrappedPage />)
    await act(async () => {})
    expect(screen.getByTestId('period')).toHaveTextContent('week')
    expect(screen.getByTestId('cover-state')).toHaveTextContent('ready')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('opens a notification-carried closed month instead of the current period', async () => {
    mocks.searchParams = new URLSearchParams('period=month&year=2026&month=8')
    render(<WrappedPage />)
    await act(async () => {})

    expect(screen.getByTestId('period')).toHaveTextContent('month')
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', {
      active: false,
      closedMonth: { year: 2026, month: 8 },
    })

    fireEvent.click(screen.getByRole('button', { name: 'week' }))
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('week', {
      active: false,
      closedMonth: undefined,
    })
  })

  it('selects the next notified closed month when only the query changes', async () => {
    mocks.searchParams = new URLSearchParams('period=month&year=2026&month=8')
    const { rerender } = render(<WrappedPage />)
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.getByTestId('player')).toBeInTheDocument()

    mocks.searchParams = new URLSearchParams('period=month&year=2026&month=9')
    rerender(<WrappedPage />)

    expect(screen.getByTestId('period')).toHaveTextContent('month')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', {
      active: false,
      closedMonth: { year: 2026, month: 9 },
    })
  })

  it('opens the player only after Start is pressed with a recap present', async () => {
    render(<WrappedPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('changing the period stops playback and switches the fetched period', async () => {
    render(<WrappedPage />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.getByTestId('player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'month' }))
    expect(screen.getByTestId('period')).toHaveTextContent('month')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it.each([
    { state: 'loading', recap: null, isEmpty: false, isLoading: true, isError: false },
    { state: 'failed', recap: null, isEmpty: false, isLoading: false, isError: true },
    { state: 'empty', recap: createMockRecap({ goalCompletions: 0, metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }) }), isEmpty: true, isLoading: false, isError: false },
  ])('restores cover navigation and feedback when playback becomes $state', async ({ state, ...wrapped }) => {
    useVersionGateStore.getState().requireReload('appUpdated')
    const view = render(<WrappedPage />)
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.getByTestId('player')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.backToProfile' })).not.toBeInTheDocument()
    act(() => { useAppToastStore.getState().showError('Wrapped fetch failed') })
    await screen.findByText('Wrapped fetch failed')
    expect(view.container.querySelector('[data-toast-page-host]')).toBeNull()

    mocks.wrapped = { ...wrapped, slides: [] }
    view.rerender(<WrappedPage />)
    await act(async () => {})

    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    expect(screen.getByTestId('cover-state')).toHaveTextContent(state)
    const back = screen.getByRole('button', { name: 'common.backToProfile' })
    expect(view.container.querySelector('[data-update-banner]')).toHaveTextContent('errors.api.appUpdated')
    expect(view.container.querySelector('[data-toast-page-host]')).toBeInTheDocument()
    fireEvent.click(back)
    expect(goBackOrFallback).toHaveBeenCalledExactlyOnceWith('/profile')
  })

  it('keeps an empty recap on the empty cover and refuses to open the player', async () => {
    mocks.wrapped = { recap: { id: 'recap-empty' }, slides: [], isEmpty: true, isLoading: false, isError: false }
    render(<WrappedPage />)
    await act(async () => {})
    expect(screen.getByTestId('cover-state')).toHaveTextContent('empty')
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('keeps a missing paused recap non-actionable', async () => {
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: false }
    render(<WrappedPage />)
    await act(async () => {})
    expect(screen.getByTestId('cover-state')).toHaveTextContent('loading')
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('provides exactly one main landmark', async () => {
    render(<WrappedPage />)
    await act(async () => {})
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('places the back control inside the capped cover frame', async () => {
    render(<WrappedPage />)
    await act(async () => {})
    const main = screen.getByRole('main')
    expect(main).toHaveClass('max-w-[900px]')
    expect(main).toContainElement(screen.getByRole('button', { name: 'common.backToProfile' }))
  })

  it('exits the cover to Profile while player close only returns to the cover', async () => {
    render(<WrappedPage />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'common.backToProfile' }))
    expect(goBackOrFallback).toHaveBeenCalledExactlyOnceWith('/profile')

    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'close-player' }))
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    expect(goBackOrFallback).toHaveBeenCalledTimes(1)
  })

  it('shows a queued error at the bottom of the cover', async () => {
    const view = render(<WrappedPage />)
    act(() => { useAppToastStore.getState().showError('Wrapped fetch failed') })

    await screen.findByText('Wrapped fetch failed')
    expect(view.container.querySelector('[data-toast-page-host] [data-kind="neutral"]')).toBeInTheDocument()
  })

  it('moves actionable feedback inside the player above its pager', async () => {
    const reload = vi.fn()
    const view = render(<WrappedPage />)
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await act(async () => {})
    act(() => { useAppToastStore.getState().showQueued('App updated', 'Reload', reload) })

    await screen.findByText('App updated')
    const player = screen.getByRole('dialog', { name: 'Wrapped' })
    const notice = player.querySelector('[data-shell-notice]')
    expect(notice?.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    expect(notice?.nextElementSibling).toHaveAttribute('data-testid', 'wrapped-pager')
    expect(view.container.querySelector('[data-toast-page-host]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
