import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC' } }),
}))

const habitRequest = vi.hoisted(() => ({
  fetchJson: vi.fn((_url: string): Promise<unknown> =>
    Promise.reject(new Error('the empty state must read the cached habit list'))),
}))

vi.mock('@/lib/api-fetch', () => habitRequest)

const TODAY = '2026-08-28'

const walkWithSubHabits = makeHabitScheduleItem({ id: 'walk', title: 'Caminhar', position: 0 })
const houseRoutine = makeHabitScheduleItem({
  id: 'house',
  title: 'Rotina da casa',
  position: 1,
  children: [],
  hasSubHabits: false,
})

function renderEmptyState(locale: 'en' | 'pt-BR', items: HabitScheduleItem[] | null, onSelectSuggestion = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (items !== null) {
    queryClient.setQueryData(
      habitKeys.list(habitListQueryFilters({ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }, true)),
      items,
    )
  }
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
      <QueryClientProvider client={queryClient}>
        <ChatEmptyState onSelectSuggestion={onSelectSuggestion} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  )
}

function suggestionLabels(): (string | null)[] {
  return screen.getAllByRole('button').map((button) => button.textContent)
}

describe('ChatEmptyState copy', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('reads the drawn pt-BR title, prompt and suggestions, with Astra in the feminine', () => {
    renderEmptyState('pt-BR', [walkWithSubHabits, houseRoutine])

    expect(screen.getByText('Fale com a Astra sobre a sua rotina')).toBeInTheDocument()
    expect(screen.getByText('Algumas coisas que dá para pedir')).toBeInTheDocument()
    expect(suggestionLabels()).toEqual([
      'Registrar "Caminhar"',
      'Como foi a semana',
      'Dividir "Rotina da casa"',
      'Como estão as metas',
    ])
  })

  it('reads the drawn English title, prompt and suggestions', () => {
    renderEmptyState('en', [walkWithSubHabits, houseRoutine])

    expect(screen.getByText('Talk to Astra about your routine')).toBeInTheDocument()
    expect(screen.getByText('Some things you can ask')).toBeInTheDocument()
    expect(suggestionLabels()).toEqual([
      'Log "Caminhar"',
      'How the week went',
      'Split "Rotina da casa"',
      'How are my goals',
    ])
  })

  it('shows the prompt and every suggestion together, once the habit list arrives', async () => {
    let answer: (page: unknown) => void = () => {}
    habitRequest.fetchJson.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    renderEmptyState('pt-BR', null)

    expect(screen.getByText('Fale com a Astra sobre a sua rotina')).toBeInTheDocument()
    expect(screen.queryByText('Algumas coisas que dá para pedir')).toBeNull()
    expect(screen.queryAllByRole('button')).toEqual([])

    await act(async () => {
      answer({ items: [houseRoutine], totalCount: 1, totalPages: 1, page: 1, pageSize: 200 })
    })

    expect(await screen.findByText('Algumas coisas que dá para pedir')).toBeInTheDocument()
    expect(suggestionLabels()).toEqual([
      'Registrar "Rotina da casa"',
      'Como foi a semana',
      'Dividir "Rotina da casa"',
      'Como estão as metas',
    ])
  })

  it.each([
    ['pt-BR', 'Caminhar', 'Registrar "Caminhar"', 'Dividir "Caminhar"'],
    ['pt-BR', 'Rotina da casa', 'Registrar "Rotina da casa"', 'Dividir "Rotina da casa"'],
    ['en', 'Meditate', 'Log "Meditate"', 'Split "Meditate"'],
    ['en', 'House routine', 'Log "House routine"', 'Split "House routine"'],
  ] as const)('sends the quoted %s suggestion for %s', (locale, title, logLabel, splitLabel) => {
    const onSelectSuggestion = vi.fn()
    const habit = makeHabitScheduleItem({ title, children: [], hasSubHabits: false })
    renderEmptyState(locale, [habit], onSelectSuggestion)

    for (const label of [logLabel, splitLabel]) {
      const button = screen.getByRole('button', { name: label })
      expect(button.textContent).toBe(label)
      fireEvent.click(button)
    }
    expect(onSelectSuggestion.mock.calls).toEqual([[logLabel], [splitLabel]])
  })

  it('offers only the two general suggestions to an account with no habits', () => {
    renderEmptyState('pt-BR', [])

    expect(suggestionLabels()).toEqual(['Como foi a semana', 'Como estão as metas'])
  })
})
