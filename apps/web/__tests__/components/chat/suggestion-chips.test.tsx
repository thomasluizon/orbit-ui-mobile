import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.habit === undefined ? key : `${key}:${values.habit}`,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC' } }),
}))

const habitRequest = vi.hoisted(() => ({
  fetchJson: vi.fn((_url: string): Promise<unknown> =>
    Promise.reject(new Error('the suggestion chips must read the cached habit list'))),
}))

vi.mock('@/lib/api-fetch', () => habitRequest)

import { SuggestionChips } from '@/components/chat/suggestion-chips'

const TODAY = '2026-08-28'

function makeTopLevelItem(overrides: Partial<HabitScheduleItem>): HabitScheduleItem {
  return makeHabitScheduleItem({
    children: [],
    hasSubHabits: false,
    scheduledDates: [TODAY],
    ...overrides,
  })
}

const TODAY_LIST_KEY = habitKeys.list(
  habitListQueryFilters({ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }, true),
)

function renderChips(items: HabitScheduleItem[] | null, onSelect = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (items !== null) queryClient.setQueryData(TODAY_LIST_KEY, items)
  render(
    <QueryClientProvider client={queryClient}>
      <SuggestionChips onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return { onSelect, queryClient }
}

describe('SuggestionChips', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('names the account habits in the drawn order', () => {
    renderChips([
      makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 }),
      makeTopLevelItem({ id: 'house', title: 'Rotina da casa', position: 1, isLoggedInRange: true }),
    ])

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'chat.suggestion.logHabit:Caminhar',
      'chat.suggestion.week',
      'chat.suggestion.splitHabit:Caminhar',
      'chat.suggestion.goals',
    ])
  })

  it('leaves out both habit suggestions when the account has no habits', () => {
    renderChips([])

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'chat.suggestion.week',
      'chat.suggestion.goals',
    ])
  })

  it('sends the shown text when a suggestion is pressed', () => {
    const { onSelect } = renderChips([makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 })])

    fireEvent.click(screen.getByText('chat.suggestion.logHabit:Caminhar'))

    expect(onSelect).toHaveBeenCalledWith('chat.suggestion.logHabit:Caminhar')
  })

  it('shows no suggestion until the habit list arrives, then all of them at once', async () => {
    let answer: (page: unknown) => void = () => {}
    habitRequest.fetchJson.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    renderChips(null)

    expect(screen.queryAllByRole('button')).toEqual([])

    await act(async () => {
      answer({
        items: [makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 })],
        totalCount: 1,
        totalPages: 1,
        page: 1,
        pageSize: 200,
      })
    })

    expect((await screen.findAllByRole('button')).map((button) => button.textContent)).toEqual([
      'chat.suggestion.logHabit:Caminhar',
      'chat.suggestion.week',
      'chat.suggestion.splitHabit:Caminhar',
      'chat.suggestion.goals',
    ])
  })

  it('keeps focus on a suggestion whose habit changes under it', async () => {
    const { queryClient } = renderChips([makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 })])
    const logSuggestion = screen.getByRole('button', { name: 'chat.suggestion.logHabit:Caminhar' })
    logSuggestion.focus()

    act(() => {
      queryClient.setQueryData(TODAY_LIST_KEY, [makeTopLevelItem({ id: 'read', title: 'Ler', position: 0 })])
    })

    await waitFor(() => expect(logSuggestion).toHaveTextContent('chat.suggestion.logHabit:Ler'))
    expect(document.activeElement).toBe(logSuggestion)
  })

  it('never paints a suggestion with the accent', () => {
    renderChips([makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 })])

    for (const button of screen.getAllByRole('button')) {
      expect(button.outerHTML).not.toContain('--primary')
      expect(button).toHaveAttribute('type', 'button')
    }
  })
})
