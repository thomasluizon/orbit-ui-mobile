import type { ChatMessage } from '../types/chat'
import {
  breakdownSubHabits,
  goalListCardFixture,
  habitListCardFixture,
  makeActionResult,
  makeAgentOperationResult,
  makeClarificationPreviewMessage,
  makeHeldHabitMessage,
} from './chat-fixtures'

const preview = makeHeldHabitMessage().pendingOperations![0]!
const clarification = makeClarificationPreviewMessage().actions![0]!

export const chatBlockLayoutCases = [
  { kind: 'preview', count: 2, fields: { pendingOperations: [preview, { ...preview, id: 'second-preview' }] } },
  { kind: 'clarification', count: 2, fields: { actions: [clarification, { ...clarification,
    clarificationRequest: { ...clarification.clarificationRequest!, operationId: '00000000-0000-4000-8000-000000000002' },
  }] } },
  { kind: 'breakdown', count: 2, fields: { actions: [1, 2].map(index => makeActionResult({
    type: 'SuggestBreakdown', status: 'Suggestion', entityId: `breakdown-${index}`, suggestedSubHabits: breakdownSubHabits,
  })) } },
  { kind: 'outcome', count: 2, fields: { operations: [makeAgentOperationResult('Failed', 1), makeAgentOperationResult('UnsupportedByPolicy', 2)] } },
  { kind: 'action', count: 1, fields: { actions: [makeActionResult()] } },
  { kind: 'lists and metrics', count: 9, fields: {
    habitList: habitListCardFixture,
    goalList: goalListCardFixture,
    metricsCard: { period: 'week', completionRate: 67, totalCompletions: 2, totalScheduled: 3,
      activeDays: 2, currentStreak: 2, bestStreak: 4, hasData: true, surfaceId: 'progress' },
    periodInsight: { period: 'week', dateFrom: '2026-09-21', dateTo: '2026-09-27', completionRate: 67,
      activeDays: 2, periodDays: 7, totalCompletions: 2, totalScheduled: 3, currentStreak: 2, bestStreak: 4,
      topHabits: [], needsAttention: [], narrative: { highlights: '', missed: '', trends: '', suggestion: '' }, surfaceId: 'progress' },
    daySummary: { date: '2026-09-29', due: 3, done: 2, completionRate: 67, overdueCount: 1, currentStreak: 4, surfaceId: 'today' },
    streakCard: { currentStreak: 2, longestStreak: 4, level: 1, totalXp: 20, xpForNextLevel: 100,
      lastActiveDate: '2026-09-29', isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' },
    calendarCard: { events: [{ title: 'Walk', start: '2026-09-29T12:00:00Z', end: null, isAllDay: false }], surfaceId: 'calendar' },
    recordList: { kind: 'tags', totalCount: 2, items: [{ id: 'tag-1', title: 'Morning' }, { id: 'tag-2', title: 'Evening' }], surfaceId: 'tags' },
    accountRows: { kind: 'profile', rows: [{ key: 'name', value: 'Orbit', valueType: 'text' }], surfaceId: 'profile' },
  } },
] satisfies { kind: string; count: number; fields: Partial<ChatMessage> }[]

export function makeChatBlockLayoutMessage(scenario: typeof chatBlockLayoutCases[number], prose: boolean): ChatMessage {
  return makeHeldHabitMessage({
    id: 'blocks', content: prose ? 'Review the routine. '.repeat(20) : '', pendingOperations: [], ...scenario.fields,
  })
}
