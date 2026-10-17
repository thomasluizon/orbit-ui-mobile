import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { inPlaceDayFixture, inPlaceCalendarFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { MetricsCard } from '@/components/chat/metrics-card'
import { i18n } from '@/lib/i18n'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureProfileRow } from '../../support/profile-row-geometry'

vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ isPending: false, isError: false, isRefetchError: false, data: { habitsById: new Map((inPlaceDayFixture.rows ?? []).map(item => [item.id, createMockHabit({ id: item.id, title: item.title })])) } }),
  useLogHabit: () => ({ mutate: vi.fn() }),
  useHabitMetrics: () => ({ isPending: false, isError: false, isRefetchError: false }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true } }) }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ isPending: false, isError: false, isRefetchError: false }) }))
afterEach(__resetTestHostConfig)
type Tree = ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }

it.each([320, 412, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale => [1, 2].map(scale => ({ width, locale, scale })))))('fits blocks at $width in $locale at $scale text', async ({ width, locale, scale }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
  await i18n.changeLanguage(locale)
  const elements = [
    <DaySummaryCard key="day" daySummary={inPlaceDayFixture} />,
    <CalendarCard key="calendar" calendarCard={inPlaceCalendarFixture} />,
    <MetricsCard key="metrics" metricsCard={{ period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} />,
  ]
  for (const element of elements) {
    let tree!: Tree
    await act(() => { tree = create(element) as Tree })
    try {
      const available = Math.min(width - 32, 740)
      const geometry = measureProfileRow(tree.toJSON(), available, scale)
      for (const control of geometry.controls) {
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(available + 1)
        if (control.accessibilityLabel?.includes('Habit') || control.accessibilityLabel?.includes('Walk with the team')) {
          expect(control.width).toBeGreaterThanOrEqual(48)
          expect(control.height).toBeGreaterThanOrEqual(48)
        }
      }
      if (element.key === 'metrics' && scale === 1) {
        const captions = geometry.texts.filter(text => text.label === i18n.t('progressScreen.window.completionRate') || text.label === i18n.t('progressScreen.window.activeDays'))
        expect(captions).toHaveLength(2)
        for (const caption of captions) expect(caption.lines, caption.label).toBe(1)
      }
    } finally { await act(() => tree.update(<></>)) }
  }
})
