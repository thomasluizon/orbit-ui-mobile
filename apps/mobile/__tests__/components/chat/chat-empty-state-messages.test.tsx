import React from 'react'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
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
          <ChatEmptyState styles={styles} />
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

  it.each(['pt-BR', 'en'] as const)('reads only the localized title and disclosure in %s', async (locale) => {
    const tree = await renderEmptyState(locale, [walkWithSubHabits, houseRoutine])
    const words = locale === 'pt-BR' ? pt : en

    expect(renderedText(tree)).toEqual([words.chat.empty.title, words.aiDisclosure.notMedicalAdvice])
    expect(suggestionLabels(tree)).toEqual([])
    TestRenderer.act(() => tree.unmount())
  })
})
