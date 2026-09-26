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
vi.mock('@/components/ui/progress-ring', () => ({ ProgressRing: ({ label }: { label: string }) => <View accessibilityRole="progressbar" accessibilityLabel={label} /> }))
vi.mock('@/components/ui/progress-bar', () => ({ ProgressBar: () => <View accessibilityRole="progressbar" /> }))
vi.mock('@/components/ui/pill-button', () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable> }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ items, body, actions }: BlockFrameProps) => <View>{body}{items.map((item) => <View testID="card-row" key={item.id}>{item.label}{item.meta ? <Text>{item.meta}</Text> : null}{item.control}</View>)}{actions}</View> }))
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
    expect(tree.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityLabel).toContain('1')
    const button = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.daySummary.open'))[0]
    TestRenderer.act(() => button.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('shows at most six earned and unearned discs', () => {
    const tree = render(<StreakCard streakCard={{ currentStreak: 0, longestStreak: 4, level: 11, totalXp: 1100, xpForNextLevel: 1200, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], achievementDiscs: Array.from({ length: 8 }, (_, index) => ({ id: `achievement-${index}`, iconKey: 'satellite', earnedAt: index % 2 ? null : '2026-09-26T10:00:00Z' })), surfaceId: 'progress' }} />)
    expect(tree.root.findAll((node: any) => node.type === View && String(node.props?.testID).startsWith('achievement-mark-'))).toHaveLength(6)
  })

  it('shows ten events and no sync row when absent', () => {
    const tree = render(<CalendarCard calendarCard={{ events: Array.from({ length: 10 }, (_, index) => ({ title: `Event ${index}`, start: '2026-09-26', end: null, isAllDay: true })), surfaceId: 'calendar' }} />)
    expect(tree.root.findAll((node: any) => node.type === View && node.props?.testID === 'card-row')).toHaveLength(10)
    expect(renderedText(tree.toJSON())).not.toContain('chat.calendarCard.sync')
  })
})
