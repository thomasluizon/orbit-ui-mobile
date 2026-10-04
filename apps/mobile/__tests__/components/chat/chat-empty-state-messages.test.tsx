import { StyleSheet } from 'react-native'
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

async function renderEmptyState(locale: 'en' | 'pt-BR', items: HabitScheduleItem[], onSelectSuggestion = vi.fn()) {
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
          <ChatEmptyState styles={styles} onSelectSuggestion={onSelectSuggestion} />
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

  it('reads the compact pt-BR title, prompt and suggestions, with Astra in the feminine', async () => {
    const tree = await renderEmptyState('pt-BR', [walkWithSubHabits, houseRoutine])

    expect(renderedText(tree)).toEqual(expect.arrayContaining([
      'Fale com a Astra',
      'Algumas coisas que dá para pedir',
    ]))
    for (const node of tree.root.findAll((node: any) => node.type === 'Text' && suggestionLabels(tree).includes(node.props.children))) {
      expect(node.props.numberOfLines).toBeUndefined()
      expect(node.props.ellipsizeMode).toBeUndefined()
    }
    expect(suggestionLabels(tree)).toEqual([
      'Registrar hábito',
      'Como foi a semana',
      'Dividir hábito',
      'Como estão as metas',
    ])
  })

  it('reads the compact English title, prompt and suggestions', async () => {
    const tree = await renderEmptyState('en', [walkWithSubHabits, houseRoutine])

    expect(renderedText(tree)).toEqual(expect.arrayContaining([
      'Talk to Astra',
      'Some things you can ask',
    ]))
    expect(suggestionLabels(tree)).toEqual([
      'Log a habit',
      'How the week went',
      'Split a habit',
      'How are my goals',
    ])
  })

  it.each([
    ['pt-BR', 'Caminhar', 'Registrar "Caminhar"', 'Dividir "Caminhar"'],
    ['pt-BR', 'Rotina da casa', 'Registrar "Rotina da casa"', 'Dividir "Rotina da casa"'],
    ['en', 'Meditate', 'Log "Meditate"', 'Split "Meditate"'],
    ['en', 'House routine', 'Log "House routine"', 'Split "House routine"'],
    ...(['pt-BR', 'en'] as const).map(locale => {
      const title = 'Caminhar com acentos e muitos detalhes '.repeat(5)
      return [locale, title, `${locale === 'pt-BR' ? 'Registrar' : 'Log'} "${title}"`, `${locale === 'pt-BR' ? 'Dividir' : 'Split'} "${title}"`] as const
    }),
  ] as const)('sends the quoted %s suggestion for %s', async (locale, title, logLabel, splitLabel) => {
    const onSelectSuggestion = vi.fn()
    const habit = makeHabitScheduleItem({ title, children: [], hasSubHabits: false })
    const tree = await renderEmptyState(locale, [habit], onSelectSuggestion)

    const expectedLabels = locale === 'pt-BR' ? ['Registrar hábito', 'Dividir hábito'] : ['Log a habit', 'Split a habit']
    expect(suggestionLabels(tree)).toEqual(expect.arrayContaining(expectedLabels))
    expect(renderedText(tree)).toEqual(expect.arrayContaining(expectedLabels))
    for (const label of expectedLabels) {
      const chip = tree.root.findAllByProps({ accessibilityLabel: label }).at(-1)
      const text = chip.findByType('Text')
      expect(text.props.numberOfLines).toBeUndefined()
      expect(text.props.ellipsizeMode).toBeUndefined()
      const style = StyleSheet.flatten(chip.props.style)
      expect(style.minHeight).toBe(48)
      expect(style.height).toBeUndefined()
      expect(style.paddingHorizontal).toBe(16)
      expect(style.paddingVertical).toBe(12)
      expect(tree.root.findAllByType('View').some((node: any) => StyleSheet.flatten(node.props.style)?.gap === 8)).toBe(true)
      TestRenderer.act(() => {
        tree.root.findAllByProps({ accessibilityLabel: label }).at(-1).props.onPress()
      })
    }
    expect(onSelectSuggestion.mock.calls).toEqual([[logLabel], [splitLabel]])
    TestRenderer.act(() => tree.unmount())
  })

  it('offers only the two general suggestions to an account with no habits', async () => {
    const tree = await renderEmptyState('pt-BR', [])

    expect(suggestionLabels(tree)).toEqual(['Como foi a semana', 'Como estão as metas'])
  })
})
