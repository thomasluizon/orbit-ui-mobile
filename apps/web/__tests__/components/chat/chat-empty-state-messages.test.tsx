import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

function renderEmptyState(locale: 'en' | 'pt-BR', items: HabitScheduleItem[] | null) {
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
        <ChatEmptyState />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  )
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

  it.each(['pt-BR', 'en'] as const)('reads only the localized title and disclosure in %s', (locale) => {
    renderEmptyState(locale, [walkWithSubHabits, houseRoutine])
    const words = locale === 'pt-BR' ? pt : en

    expect(screen.getByText(words.chat.empty.title)).toBeInTheDocument()
    expect(screen.getByText(words.aiDisclosure.notMedicalAdvice)).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getAllByRole('paragraph').map(paragraph => paragraph.textContent)).toEqual([
      words.chat.empty.title,
      words.aiDisclosure.notMedicalAdvice,
    ])
  })
})
