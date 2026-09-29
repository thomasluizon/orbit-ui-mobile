import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function renderEmptyState(items: HabitScheduleItem[] | null, onSelectSuggestion = vi.fn()) {
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
        <ChatEmptyState styles={styles} onSelectSuggestion={onSelectSuggestion} />
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

  it('shows no suggestion until the habit list arrives, then all of them at once', async () => {
    let answer: (page: unknown) => void = () => {}
    habitRequest.apiClient.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    const { tree } = renderEmptyState(null)

    expect(suggestionLabels(tree)).toEqual([])

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
