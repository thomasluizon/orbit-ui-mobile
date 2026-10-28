import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const invalidateQueriesMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

vi.mock('@orbit/shared/query', () => ({
  gamificationKeys: { all: ['gamification'] },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'Pacific/Kiritimati' } }),
}))

import { TodayProvider, useToday } from '@/app/(app)/today-provider'

const originalTimeZone = process.env.TZ

function TodayProbe() {
  return <span data-testid="today">{useToday()}</span>
}

function DefaultAccountTodayProbe() {
  return <span data-testid="default-today">{useToday()}</span>
}

function AccountTodayProbe() {
  return <span data-testid="today">{useToday('Pacific/Kiritimati')}</span>
}

function NullableAccountTodayProbe() {
  return <span data-testid="today">{useToday(null)}</span>
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
    process.env.TZ = 'America/Sao_Paulo'
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  it('provides the account day to consumers by default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T09:00:00Z'))

    renderProvider()

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-07')
  })

  it('provides the current day in the account timezone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T10:30:00.000Z'))

    render(<TodayProvider><AccountTodayProbe /></TodayProvider>)

    expect(screen.getByTestId('today')).toHaveTextContent('2026-09-12')
  })

  it('uses UTC when the account timezone is null', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T01:30:00.000Z'))

    render(<TodayProvider><NullableAccountTodayProbe /></TodayProvider>)

    expect(screen.getByTestId('today')).toHaveTextContent('2026-09-12')
  })

  it('advances at account midnight while the device remains on the previous day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T09:59:59.000Z'))
    render(<TodayProvider><AccountTodayProbe /><DefaultAccountTodayProbe /></TodayProvider>)
    expect(screen.getByTestId('today')).toHaveTextContent('2026-09-11')
    expect(screen.getByTestId('default-today')).toHaveTextContent('2026-09-11')

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(screen.getByTestId('today')).toHaveTextContent('2026-09-12')
    expect(screen.getByTestId('default-today')).toHaveTextContent('2026-09-12')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['gamification'] })
  })

  it('advances the day and refreshes gamification when the tab regains visibility on a new day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T09:00:00Z'))

    renderProvider()
    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-07')

    vi.setSystemTime(new Date('2026-04-08T09:00:00Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-08')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['gamification'] })
  })

  it('keeps the account day when only the device crosses midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T23:59:55'))

    renderProvider()
    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-08')

    act(() => {
      vi.advanceTimersByTime(6_000)
    })

    expect(screen.getByTestId('today')).toHaveTextContent('2026-04-08')
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it('does not refresh gamification when a focus event fires on the same day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T09:00:00Z'))

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
