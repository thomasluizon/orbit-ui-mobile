import { RecordListCard } from '@/components/chat/record-list-card'
import { buildChatFinalMessageFields } from '@orbit/shared/chat/final-message'
import { chatStreamEventSchema } from '@orbit/shared/types/chat'
import { apiStatusCardsFinalFixture } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/message-bubble'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { StreakCard } from '@/components/chat/streak-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ push: vi.fn(), language: 'pt-BR', uses24HourClock: false }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, timeZone: 'Pacific/Honolulu', uses24HourClock: mocks.uses24HourClock } }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string, params?: Record<string, unknown>) => params ? `${key}:${JSON.stringify(params)}` : key,
  i18n: { language: mocks.language },
}) }))
vi.mock('@/components/ui/progress-ring', () => ({ ProgressRing: ({ label }: { label: string }) => <View accessibilityRole="progressbar" accessibilityLabel={label} /> }))
vi.mock('@/components/ui/progress-bar', () => ({ ProgressBar: ({ value, max }: { value: number; max: number }) => <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }} /> }))
vi.mock('@/components/ui/pill-button', () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable> }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ items, body, actions }: BlockFrameProps) => <View>{body}{items.map((item) => <View testID="card-row" nativeID={item.status ?? 'normal'} key={item.id}>{item.label}{item.meta ? <Text>{item.meta}</Text> : null}{item.control}</View>)}{actions}</View> }))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return { ...actual, createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }
})

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree
}

vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <Text>{children}</Text> }))
vi.mock('@/components/chat/breakdown-suggestion', () => ({ BreakdownSuggestion: () => null }))
vi.mock('@/components/chat/clarification-card', () => ({ ClarificationCard: () => null }))
vi.mock('@/components/chat/pending-operation-card', () => ({ PendingOperationCard: () => null }))
vi.mock('@/components/chat/habit-list-card', () => ({ HabitListCard: () => null }))
vi.mock('@/components/chat/goal-list-card', () => ({ GoalListCard: () => null }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))

describe('Astra status cards on mobile', () => {
  beforeEach(() => { mocks.push.mockReset(); mocks.language = 'pt-BR'; mocks.uses24HourClock = false })

  it('labels the day ring and opens Today', () => {
    const tree = render(<DaySummaryCard daySummary={{ date: '2026-09-26', due: 3, done: 1, completionRate: 33, overdueCount: 2, currentStreak: 4, surfaceId: 'today' }} />)
    expect(tree.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityLabel).toContain('"done":1,"due":3')
    const button = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.daySummary.open'))[0]
    TestRenderer.act(() => button.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('keeps overdue visible when nothing is due today', () => {
    const tree = render(<DaySummaryCard daySummary={{ date: '2026-09-26', due: 0, done: 0, completionRate: null, overdueCount: 2, currentStreak: 4, surfaceId: 'today' }} />)
    expect(renderedText(tree.toJSON())).toContain('chat.daySummary.overdue')
    expect(tree.root.findAll((node: any) => node.props?.accessibilityRole === 'progressbar')).toHaveLength(0)
  })

  it('shows at most six earned and unearned discs', () => {
    const tree = render(<StreakCard streakCard={{ currentStreak: 0, longestStreak: 4, level: 11, totalXp: 12200, xpForNextLevel: 14400, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], achievementDiscs: Array.from({ length: 8 }, (_, index) => ({ id: `achievement-${index}`, iconKey: 'satellite', earnedAt: index % 2 ? null : '2026-09-26T10:00:00Z' })), surfaceId: 'progress' }} />)
    expect(tree.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue).toEqual({ min: 0, max: 2300, now: 100 })
    expect(tree.root.findAll((node: any) => node.type === View && String(node.props?.testID).startsWith('achievement-mark-'))).toHaveLength(6)
    const open = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.streakCard.open'))[0]
    TestRenderer.act(() => open.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/progress/streak')
  })

  it('ends the streak strip on the account date across device midnight', () => {
    vi.stubEnv('TZ', 'UTC')
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-26T06:00:00Z'))
      const tree = render(<StreakCard streakCard={{ currentStreak: 1, longestStreak: 1, level: 1, totalXp: 10, xpForNextLevel: 100, lastActiveDate: '2026-09-25', isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />)
      const cells = tree.root.findAll((node: any) => node.props?.accessibilityRole === 'image')
      expect(cells.at(-1).props.testID).toBe('day-strip-cell-active')
      expect(cells.at(-1).props.accessibilityLabel).toContain('25')
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    }
  })

  it('shows ten events and no sync row when absent', () => {
    const tree = render(<CalendarCard calendarCard={{ events: Array.from({ length: 10 }, (_, index) => ({ title: `Event ${index}`, start: '2026-09-26', end: null, isAllDay: true })), surfaceId: 'calendar' }} />)
    expect(tree.root.findAll((node: any) => node.type === View && node.props?.testID === 'event-row-all-day')).toHaveLength(10)
    expect(renderedText(tree.toJSON())).toContain('chat.calendarCard.allDay')
    expect(renderedText(tree.toJSON())).not.toContain('chat.calendarCard.sync')
    const open = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.calendarCard.open'))[0]
    TestRenderer.act(() => open.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/calendar')
  })

  it.each([
    ['pt-BR', false, '7:30 PM', '19:30'],
    ['en', true, '19:30', '7:30 PM'],
  ])('shows a timed calendar event with %s and the saved clock', (language, uses24HourClock, expected, excluded) => {
    mocks.language = language
    mocks.uses24HourClock = uses24HourClock
    const tree = render(<CalendarCard calendarCard={{ events: [{ title: 'Meeting', start: '2026-09-26T19:30:00', end: null, isAllDay: false }], surfaceId: 'calendar' }} />)
    expect(renderedText(tree.toJSON())).toContain(expected)
    expect(renderedText(tree.toJSON())).not.toContain(excluded)
  })

  it('shows disabled sync without a failure mark', () => {
    const tree = render(<CalendarCard calendarCard={{ events: [], surfaceId: 'calendar', sync: { enabled: false, status: 'ReconnectRequired', lastSyncedAt: null } }} />)
    const row = tree.root.findAll((node: any) => node.props?.testID === 'card-row')[0]
    expect(row.props.nativeID).toBe('normal')
  })
})

it('renders API streak, calendar and both record list blocks in the final message', () => {
  const event = chatStreamEventSchema.parse(apiStatusCardsFinalFixture)
  if (event.type !== 'final') throw new Error('Expected a final event')
  const message = { id: 'status', role: 'ai' as const, timestamp: new Date(), ...buildChatFinalMessageFields(event.response, []) }
  const tree = render(<MessageBubble message={message} />)
  expect(tree.root.findAllByType(StreakCard)).toHaveLength(1)
  expect(tree.root.findAllByType(CalendarCard)).toHaveLength(1)
  expect(renderedText(tree.toJSON())).toContain('Dentist')
  expect(renderedText(tree.toJSON())).toContain('Morning')
  expect(renderedText(tree.toJSON())).toContain('Evening')
  expect(tree.root.findAllByType(RecordListCard)).toHaveLength(2)
  TestRenderer.act(() => tree.update(<MessageBubble message={message} isStreaming />))
  expect(tree.root.findAllByType(RecordListCard)).toHaveLength(0)
  expect(tree.root.findAllByType(StreakCard)).toHaveLength(0)
  expect(tree.root.findAllByType(CalendarCard)).toHaveLength(0)
  TestRenderer.act(() => tree.update(<MessageBubble message={{ ...message, role: 'user' }} />))
  expect(tree.root.findAllByType(RecordListCard)).toHaveLength(0)
  expect(tree.root.findAllByType(StreakCard)).toHaveLength(0)
  expect(tree.root.findAllByType(CalendarCard)).toHaveLength(0)
  TestRenderer.act(() => tree.unmount())
})

vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: new Map() }, isPending: false, isError: false, isRefetchError: false }), useLogHabit: () => ({ mutate: vi.fn() }), useHabitMetrics: () => ({ isPending: false, isError: false, isRefetchError: false }) }))

vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
vi.mock('@/hooks/use-recap', () => ({ useProgressRecap: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({ streakInfo: null, streakQuery: { isPending: false, isError: false, isRefetchError: false } }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
