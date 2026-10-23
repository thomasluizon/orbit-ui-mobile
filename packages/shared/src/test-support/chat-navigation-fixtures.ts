import type { ChatBlockPart, MetricsCard } from '../types/chat'
import { inPlaceCalendarFixture, inPlaceDayFixture } from '../__tests__/in-place-block-fixtures'
import { goalListCardFixture, habitListCardFixture } from './chat-fixtures'

const metrics: MetricsCard = { period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }

interface NavigationCase {
  name: string
  part: ChatBlockPart
  label: string
  web: string
  mobile: string | { pathname: string; params: Record<string, string> }
}

export const chatNavigationCases: readonly NavigationCase[] = [
  { name: 'habit row', part: { type: 'block', kind: 'habitList', block: habitListCardFixture }, label: 'chat.habitList.open:{"name":"Water"}', web: '/habits/habit-1', mobile: { pathname: '/habits/[id]', params: { id: 'habit-1' } } },
  { name: 'goal list', part: { type: 'block', kind: 'goalList', block: goalListCardFixture }, label: 'chat.goalList.progressLink', web: '/progress/goals', mobile: '/progress/goals' },
  { name: 'account metrics', part: { type: 'block', kind: 'metrics', block: metrics }, label: 'chat.metrics.progressLink', web: '/progress', mobile: '/progress' },
  { name: 'habit metrics', part: { type: 'block', kind: 'metrics', block: { ...metrics, period: 'habit', habitId: 'habit-1' } }, label: 'chat.metrics.habitLink', web: '/habits/habit-1', mobile: { pathname: '/habits/[id]', params: { id: 'habit-1' } } },
  { name: 'day overview', part: { type: 'block', kind: 'daySummary', block: inPlaceDayFixture }, label: 'chat.daySummary.open', web: '/', mobile: '/' },
  { name: 'day habit row', part: { type: 'block', kind: 'daySummary', block: inPlaceDayFixture }, label: 'chat.habitList.open:{"name":"Habit 1"}', web: '/habits/habit-1', mobile: { pathname: '/habits/[id]', params: { id: 'habit-1' } } },
  { name: 'streak', part: { type: 'block', kind: 'streak', block: { currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' } }, label: 'chat.streakCard.open', web: '/progress/streak', mobile: '/progress/streak' },
  { name: 'calendar', part: { type: 'block', kind: 'calendar', block: inPlaceCalendarFixture }, label: 'chat.calendarCard.open', web: '/calendar', mobile: '/calendar' },
  { name: 'calendar import', part: { type: 'block', kind: 'calendar', block: inPlaceCalendarFixture }, label: 'chat.calendarCard.makeHabit:{"title":"Walk with the team"}', web: '/calendar?import=1&event=event%20%2Fone', mobile: { pathname: '/calendar', params: { import: '1', event: 'event /one' } } },
  ...(['keys', 'notifications'] as const).map((kind): NavigationCase => ({ name: `${kind} records`, part: { type: 'block', kind: 'recordList', block: { kind, items: [], totalCount: 0, surfaceId: kind === 'keys' ? 'profile' : 'notifications' } }, label: `chat.recordList.open.${kind}`, web: kind === 'keys' ? '/profile' : '/notifications', mobile: kind === 'keys' ? '/profile' : '/notifications' })),
  ...(['profile', 'plan'] as const).map((kind): NavigationCase => ({ name: `${kind} account`, part: { type: 'block', kind: 'accountRows', block: { kind, rows: [], surfaceId: 'profile' } }, label: 'chat.account.open', web: '/profile', mobile: '/profile' })),
]
