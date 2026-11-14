import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useWrapped: vi.fn(),
  refetch: vi.fn(() => Promise.resolve()),
  wrapped: { recap: null as unknown, slides: [] as unknown[], isEmpty: false, isLoading: false, isError: false },
}))

vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: (...args: unknown[]) => {
    mocks.useWrapped(...args)
    return { ...mocks.wrapped, refetch: mocks.refetch }
  },
}))
vi.mock('@/app/(app)/wrapped/_components/wrapped-player', () => ({
  WrappedPlayer: () => <div role="dialog" aria-label="Wrapped" data-testid="player" />,
}))

import WrappedPage from '@/app/(app)/wrapped/page'

function renderPage() {
  return render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><WrappedPage /></NextIntlClientProvider>)
}

beforeEach(() => {
  mocks.searchParams = new URLSearchParams()
  mocks.useWrapped.mockClear()
  mocks.refetch.mockClear()
  mocks.wrapped = { recap: createMockRecap(), slides: [{ id: 'intro' }], isEmpty: false, isLoading: false, isError: false }
})

afterEach(cleanup)

describe('the guided Wrapped route on web', () => {
  it('loads the recap of the closed month from the route query, as the current route does', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.searchParams = new URLSearchParams('period=month&year=2026&month=10')
    const { container } = renderPage()

    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', { active: false, closedMonth: { year: 2026, month: 10 } })
    expect(container.querySelector('[data-wrapped-cover="guided"]')).toHaveAttribute('data-state', 'ready')
  })

  it('bounds the page to the window so the block scrolls under the app bar and the start action stays pinned', () => {
    enableTestFlags('orbit_guided_flows')
    const { container } = renderPage()

    expect(container.querySelector('main')).toHaveClass('h-dvh')
    expect(container.querySelector('main')).not.toHaveClass('min-h-dvh')
  })

  it('reads the recap again on retry after an error', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: true }
    renderPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ptBR.wrapped.retry })) })
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('reads another period from a quick option and opens the player from the start action', () => {
    enableTestFlags('orbit_guided_flows')
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: ptBR.wrapped.periods.year }))
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('year', { active: false, closedMonth: undefined })
    fireEvent.click(screen.getByRole('button', { name: ptBR.wrapped.start }))
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('keeps the current page frame with the flag off', () => {
    const { container } = renderPage()

    expect(container.querySelector('main')).toHaveClass('min-h-dvh')
    expect(container.querySelector('[data-wrapped-cover="guided"]')).toBeNull()
  })
})
