import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import { TodayAstra } from '@/components/today/today-astra'
import { Shell412 } from '@/components/shell/shell-412'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  composerProps: ComposerProps | null
  calendarMonth: CalendarMonthResponse
  profile: { hasLoggedFirstHabit?: boolean }
  useCalendarDateRange: ReturnType<typeof vi.fn>
  useStreakInfo: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  composerProps: null,
  calendarMonth: { habits: [], logs: {} },
  profile: { hasLoggedFirstHabit: true },
  useCalendarDateRange: vi.fn(),
  useStreakInfo: vi.fn(() => ({ data: { lastActiveDate: '2026-08-27' } })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { days?: number }) =>
      values?.days === undefined ? key : `${key}:${values.days}`,
  }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-calendar-data', () => ({ useCalendarDateRange: mocks.useCalendarDateRange }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakInfo: mocks.useStreakInfo }))
vi.mock('@/hooks/use-chat-composer', () => ({
  useChatComposer: () => ({
    composerProps: {
      state: 'idle',
      value: '',
      onChangeValue: vi.fn(),
      onSend: vi.fn(),
      words: {
        placeholder: 'placeholder',
        send: 'send',
        suggestionsLabel: 'suggestions',
        retry: 'retry',
      },
      suggestions: [],
    },
    starterChips: ['Plan a walk', 'Plan reading', 'Plan sleep'],
    atMessageLimit: false,
  }),
}))
vi.mock('@/components/shell/composer', () => ({
  Composer: (props: ComposerProps) => {
    mocks.composerProps = props
    return React.createElement('TodayComposer')
  },
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bg: '#111111', hairline: '#222222', fg2: '#eeeeee', fg3: '#aaaaaa' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer

function ConversationComposer() {
  const open = useUIStore((state) => state.astraConversationOpen)
  const draft = useChatStore((state) => state.draft)
  return open ? React.createElement('ConversationInput', { value: draft }) : null
}

function calendarWithLogs(
  logs: CalendarMonthResponse['logs'],
): CalendarMonthResponse {
  return { habits: [], logs }
}

async function renderTodayAstra(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <Shell412 tabBar={React.createElement('TabBar')}>
        <TodayAstra today="2026-08-29" isTodaySelected suppressed={false} />
      </Shell412>,
    )
    await Promise.resolve()
  })
  return tree
}

function hasText(tree: ReactTestRenderer, text: string): boolean {
  return tree.root.findAll((node) =>
    Array.isArray(node.props.children) && node.props.children.includes(text),
  ).length > 0
}

function hasTextStartingWith(tree: ReactTestRenderer, prefix: string): boolean {
  return tree.root.findAll((node) =>
    Array.isArray(node.props.children) && node.props.children.some(
      (child: unknown) => typeof child === 'string' && child.startsWith(prefix),
    ),
  ).length > 0
}

describe('mobile Today Astra', () => {
  beforeEach(() => {
    mocks.composerProps = null
    mocks.profile = { hasLoggedFirstHabit: true }
    mocks.calendarMonth = calendarWithLogs({
      habit: [
        { id: 'completion', date: '2026-08-25', value: 1, createdAtUtc: '2026-08-25T10:00:00Z' },
      ],
    })
    mocks.useCalendarDateRange.mockReset()
    mocks.useCalendarDateRange.mockImplementation(() => ({ calendarMonth: mocks.calendarMonth }))
    mocks.useStreakInfo.mockClear()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
  })

  it('keeps the completion interval after at least three missed days', async () => {
    const tree = await renderTodayAstra()

    expect(hasText(tree, 'todayAstra.returning:4')).toBe(true)
  })

  it('does not let a newer streak freeze move the completion date', async () => {
    mocks.calendarMonth = calendarWithLogs({
      habit: [
        { id: 'completion', date: '2026-08-23', value: 1, createdAtUtc: '2026-08-23T10:00:00Z' },
      ],
    })
    mocks.useStreakInfo.mockReturnValue({ data: { lastActiveDate: '2026-08-28' } })

    const tree = await renderTodayAstra()

    expect(hasText(tree, 'todayAstra.returning:6')).toBe(true)
    expect(mocks.useStreakInfo).not.toHaveBeenCalled()
  })

  it('does not claim an interval for a recent subhabit completion omitted by calendar-month', async () => {
    mocks.calendarMonth = calendarWithLogs({})

    const tree = await renderTodayAstra()

    expect(hasTextStartingWith(tree, 'todayAstra.returning')).toBe(false)
    expect(hasText(tree, 'todayAstra.returningOverWindow')).toBe(false)
  })

  it('does not claim an interval for a recent general habit completion omitted by calendar-month', async () => {
    mocks.calendarMonth = calendarWithLogs({})

    const tree = await renderTodayAstra()

    expect(hasTextStartingWith(tree, 'todayAstra.returning')).toBe(false)
    expect(hasText(tree, 'todayAstra.returningOverWindow')).toBe(false)
  })

  it('does not claim an interval when the account has never completed a habit', async () => {
    mocks.profile = { hasLoggedFirstHabit: false }
    mocks.calendarMonth = calendarWithLogs({})

    const tree = await renderTodayAstra()

    expect(hasTextStartingWith(tree, 'todayAstra.returning')).toBe(false)
    expect(hasText(tree, 'todayAstra.returningOverWindow')).toBe(false)
  })

  it('does not claim an interval when completion history is absent from the profile', async () => {
    mocks.profile = {}
    mocks.calendarMonth = calendarWithLogs({})

    const tree = await renderTodayAstra()

    expect(hasTextStartingWith(tree, 'todayAstra.returning')).toBe(false)
    expect(hasText(tree, 'todayAstra.returningOverWindow')).toBe(false)
  })

  it('hands a selected chip to the conversation with one logs request for 50 habits', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <TodayAstra
            today="2026-08-29"
            isTodaySelected
            suppressed={false}
          />
          {Array.from({ length: 50 }, (_, index) => React.createElement('HabitRow', { key: index }))}
          <ConversationComposer />
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(mocks.useCalendarDateRange).toHaveBeenCalledTimes(1)
    expect(mocks.useCalendarDateRange).toHaveBeenCalledWith('2026-07-30', '2026-08-29', true)
    expect(mocks.composerProps?.suggestions).toHaveLength(4)
    const selectedSuggestion = mocks.composerProps?.suggestions[0]
    if (!selectedSuggestion) throw new Error('Today suggestion was not registered')

    await TestRenderer.act(async () => {
      selectedSuggestion.onSelect()
      await Promise.resolve()
    })

    const input = tree.root.findAll((node) => String(node.type) === 'ConversationInput')[0]
    if (!input) throw new Error('Conversation composer did not open')
    expect(input.props.value).toBe('todayAstra.createSentence')
  })
})
