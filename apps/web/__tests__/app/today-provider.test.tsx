import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const invalidateQueriesMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

vi.mock('@orbit/shared/query', () => ({
  gamificationKeys: { all: ['gamification'] },
}))

vi.mock('@orbit/shared/utils', () => ({
  formatAPIDate: (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`,
}))

import { TodayProvider, useToday } from '@/app/(app)/today-provider'

function TodayProbe() {
  return <span data-testid="today">{useToday()}</span>
}

function renderProvider() {
  return render(
    <TodayProvider>
      <TodayProbe />
    </TodayProvider>,
  )
}

describe('TodayProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('provides the current local day to consumers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T10:00:00'))

    renderProvider()

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-07')
  })

  it('advances the day and refreshes gamification when the tab regains visibility on a new day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T10:00:00'))

    renderProvider()
    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-07')

    vi.setSystemTime(new Date('2026-04-08T09:00:00'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-08')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['gamification'] })
  })

  it('advances the day and refreshes gamification at local midnight without a focus event', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T23:59:55'))

    renderProvider()
    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-07')

    act(() => {
      vi.advanceTimersByTime(6_000)
    })

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-08')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['gamification'] })
  })

  it('does not refresh gamification when a focus event fires on the same day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T10:00:00'))

    renderProvider()
    invalidateQueriesMock.mockClear()

    act(() => {
      globalThis.dispatchEvent(new Event('focus'))
    })

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-07')
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it('throws when useToday is read without a provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TodayProbe />)).toThrow(
      'useToday must be used within a TodayProvider',
    )

    consoleError.mockRestore()
  })
})
