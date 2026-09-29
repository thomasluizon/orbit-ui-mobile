import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { createStyles } from '@/components/chat/conversation.styles'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'

vi.unmock('react-i18next')

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC' } }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: () => Promise.reject(new Error('the empty state must read the cached habit list')),
}))

const TestRenderer = require('react-test-renderer')

const TODAY = '2026-08-28'
const styles = createStyles(createTokensV2('orange', 'dark'))

const walkWithSubHabits = makeHabitScheduleItem({ id: 'walk', title: 'Caminhar', position: 0 })
const houseRoutine = makeHabitScheduleItem({
  id: 'house',
  title: 'Rotina da casa',
  position: 1,
  children: [],
  hasSubHabits: false,
})

async function renderEmptyState(locale: 'en' | 'pt-BR', items: HabitScheduleItem[]) {
  await i18n.changeLanguage(locale)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(
    habitKeys.list(habitListQueryFilters({ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }, true)),
    items,
  )
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ChatEmptyState styles={styles} onSelectSuggestion={vi.fn()} />
        </QueryClientProvider>
      </I18nextProvider>,
    )
  })
  return tree
}

function renderedText(tree: any): string[] {
  return tree.root
    .findAll((node: any) => node.type === 'Text')
    .map((node: any) => [node.props.children].flat().join(''))
}

function suggestionLabels(tree: any): string[] {
  return tree.root
    .findAll((node: any) => typeof node.type === 'string' && node.props?.accessibilityRole === 'button')
    .map((node: any) => node.props.accessibilityLabel as string)
}

describe('ChatEmptyState copy (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the drawn pt-BR title, prompt and suggestions, with Astra in the feminine', async () => {
    const tree = await renderEmptyState('pt-BR', [walkWithSubHabits, houseRoutine])

    expect(renderedText(tree)).toEqual(expect.arrayContaining([
      'Fale com a Astra sobre a sua rotina',
      'Algumas coisas que dá para pedir',
    ]))
    expect(suggestionLabels(tree)).toEqual([
      'Registrar Caminhar',
      'Como foi a semana',
      'Dividir Rotina da casa',
      'Como estão as metas',
    ])
  })

  it('reads the drawn English title, prompt and suggestions', async () => {
    const tree = await renderEmptyState('en', [walkWithSubHabits, houseRoutine])

    expect(renderedText(tree)).toEqual(expect.arrayContaining([
      'Talk to Astra about your routine',
      'Some things you can ask',
    ]))
    expect(suggestionLabels(tree)).toEqual([
      'Log Caminhar',
      'How was my week',
      'Split Rotina da casa',
      'How are my goals doing',
    ])
  })

  it('offers only the two general suggestions to an account with no habits', async () => {
    const tree = await renderEmptyState('pt-BR', [])

    expect(suggestionLabels(tree)).toEqual(['Como foi a semana', 'Como estão as metas'])
  })
})
