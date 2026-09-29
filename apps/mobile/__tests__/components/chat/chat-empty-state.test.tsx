import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { createStyles } from '@/components/chat/conversation.styles'
import { createTokensV2 } from '@/lib/theme'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.habit === undefined ? key : `${key}:${values.habit}`,
    i18n: { language: 'pt-BR' },
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC' } }),
}))

const habitRequest = vi.hoisted(() => ({
  apiClient: vi.fn((_url: string): Promise<unknown> =>
    Promise.reject(new Error('the empty state must read the cached habit list'))),
}))

vi.mock('@/lib/api-client', () => habitRequest)

const TestRenderer = require('react-test-renderer')

const TODAY = '2026-08-28'
const tokens = createTokensV2('orange', 'dark')
const styles = createStyles(tokens)

function makeTopLevelItem(overrides: Partial<HabitScheduleItem>): HabitScheduleItem {
  return makeHabitScheduleItem({
    children: [],
    hasSubHabits: false,
    scheduledDates: [TODAY],
    ...overrides,
  })
}

function renderEmptyState(
  items: HabitScheduleItem[] | null,
  onSelectSuggestion = vi.fn(),
  contextualAction?: { label: string; onSelect: () => void },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (items !== null) {
    queryClient.setQueryData(
      habitKeys.list(habitListQueryFilters({ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }, true)),
      items,
    )
  }
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <ChatEmptyState styles={styles} onSelectSuggestion={onSelectSuggestion} contextualAction={contextualAction} />
      </QueryClientProvider>,
    )
  })
  return { tree, onSelectSuggestion }
}

function suggestionLabels(tree: any): string[] {
  return tree.root
    .findAll((node: any) => typeof node.type === "string" && node.props?.accessibilityRole === "button")
    .map((node: any) => node.props.accessibilityLabel as string)
}

describe('ChatEmptyState (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the empty thread with the Astra mark, on no disc and with no accent', () => {
    const { tree } = renderEmptyState([])

    expect(tree.root.findAll((node: any) =>
      typeof node.type === 'string' && node.props?.testID === 'empty-state-mark-astra',
    )).toHaveLength(1)
    const rendered = JSON.stringify(tree.toJSON())
    expect(rendered).not.toContain(tokens.primary)
    expect(rendered).not.toContain(tokens.primaryRgb)
  })

  it('sets the prompt and the disclosure on the type scale, in the third text tone', () => {
    const { tree } = renderEmptyState([])
    const textStyle = (content: string) => StyleSheet.flatten(
      tree.root.find((node: any) => node.type === 'Text' && node.props.children === content).props.style,
    )

    expect(textStyle('chat.suggestion.prompt')).toMatchObject({ fontSize: 14, color: tokens.fg3 })
    expect(textStyle('aiDisclosure.notMedicalAdvice')).toMatchObject({ fontSize: 12, color: tokens.fg3 })
  })

  it('renders the drawn title, the prompt and the disclosure', () => {
    const { tree } = renderEmptyState([])
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain('chat.empty.title')
    expect(rendered).toContain('chat.suggestion.prompt')
    expect(rendered).toContain('aiDisclosure.notMedicalAdvice')
  })

  it('names the account habits in the drawn order', () => {
    const { tree } = renderEmptyState([
      makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 }),
      makeTopLevelItem({ id: 'house', title: 'Rotina da casa', position: 1, isLoggedInRange: true }),
    ])

    expect(suggestionLabels(tree)).toEqual([
      'chat.suggestion.logHabit:Caminhar',
      'chat.suggestion.week',
      'chat.suggestion.splitHabit:Caminhar',
      'chat.suggestion.goals',
    ])
  })

  it('shows the prompt and every suggestion together, once the habit list arrives', async () => {
    let answer: (page: unknown) => void = () => {}
    habitRequest.apiClient.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    const { tree } = renderEmptyState(null)

    expect(suggestionLabels(tree)).toEqual([])
    expect(JSON.stringify(tree.toJSON())).not.toContain('chat.suggestion.prompt')

    await TestRenderer.act(async () => {
      answer({
        items: [makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 })],
        totalCount: 1,
        totalPages: 1,
        page: 1,
        pageSize: 200,
      })
      await vi.advanceTimersByTimeAsync(50)
    })

    expect(suggestionLabels(tree)).toEqual([
      'chat.suggestion.logHabit:Caminhar',
      'chat.suggestion.week',
      'chat.suggestion.splitHabit:Caminhar',
      'chat.suggestion.goals',
    ])
  })

  it('offers a requested contextual action at once, while the habit list is still on its way', () => {
    habitRequest.apiClient.mockImplementationOnce(() => new Promise(() => {}))
    const onSelect = vi.fn()
    const { tree } = renderEmptyState(null, vi.fn(), { label: 'Criar uma meta', onSelect })

    expect(suggestionLabels(tree)).toEqual(['Criar uma meta'])
    TestRenderer.act(() => {
      tree.root.findAll((node: any) => node.props?.accessibilityLabel === 'Criar uma meta' && node.props?.onPress)[0].props.onPress()
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('keeps a long habit title on one line inside its suggestion', () => {
    const { tree } = renderEmptyState([
      makeTopLevelItem({ id: 'long', title: 'Arrumar a casa inteira antes do almoço de domingo', position: 0 }),
    ])

    const labels = tree.root
      .findAll((node: any) => typeof node.type === 'string' && node.props?.accessibilityRole === 'button')
      .flatMap((button: any) => button.findAll((node: any) => node.type === 'Text'))
    expect(labels).toHaveLength(4)
    for (const label of labels) expect(label.props.numberOfLines).toBe(1)
  })

  it('leaves out both habit suggestions when the account has no habits', () => {
    const { tree } = renderEmptyState([])

    expect(suggestionLabels(tree)).toEqual(['chat.suggestion.week', 'chat.suggestion.goals'])
  })

  it('sends the shown text when a suggestion is pressed', () => {
    const { tree, onSelectSuggestion } = renderEmptyState([
      makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 }),
    ])

    const chip = tree.root.findAll((node: any) =>
      node.props?.accessibilityLabel === 'chat.suggestion.logHabit:Caminhar' && node.props?.onPress,
    )[0]
    TestRenderer.act(() => {
      chip.props.onPress()
    })

    expect(onSelectSuggestion).toHaveBeenCalledWith('chat.suggestion.logHabit:Caminhar')
  })
})
