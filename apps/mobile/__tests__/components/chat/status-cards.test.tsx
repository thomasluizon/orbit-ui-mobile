import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { StreakCard } from '@/components/chat/streak-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'Pacific/Honolulu' } }) }))
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

describe('Astra status cards on mobile', () => {
  beforeEach(() => mocks.push.mockReset())

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
    expect(mocks.push).toHaveBeenCalledWith('/progress')
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
    expect(tree.root.findAll((node: any) => node.type === View && node.props?.testID === 'card-row')).toHaveLength(10)
    expect(renderedText(tree.toJSON())).toContain('chat.calendarCard.allDay')
    expect(renderedText(tree.toJSON())).not.toContain('chat.calendarCard.sync')
    const open = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.calendarCard.open'))[0]
    TestRenderer.act(() => open.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/calendar')
  })

  it('shows disabled sync without a failure mark', () => {
    const tree = render(<CalendarCard calendarCard={{ events: [], surfaceId: 'calendar', sync: { enabled: false, status: 'ReconnectRequired', lastSyncedAt: null } }} />)
    const row = tree.root.findAll((node: any) => node.props?.testID === 'card-row')[0]
    expect(row.props.nativeID).toBe('normal')
  })
})
