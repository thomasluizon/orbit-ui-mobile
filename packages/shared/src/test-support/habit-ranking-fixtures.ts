export const habitRankingCardFixture = {
  surfaceId: 'progress',
  ranking: {
    queryId: 'resolved-ranking', queryToken: 'signed-query', revision: 'revision-one',
    query: {
      dateFrom: '2026-07-01', dateToExclusive: '2026-10-01', timeZone: 'America/Sao_Paulo',
      metric: 'completion_log_records',
      countDefinition: 'Count of distinct positive completion log records; undone, deleted and slip records excluded.',
      scope: {
        entityType: 'positive_recurring_habits', includeChildren: true, parentCounts: 'own_logs_only',
        inactiveHabits: 'include_ended_and_completed', softDeletedHabits: 'exclude_with_logs',
        tasksAndSlips: 'exclude', zeroCompletions: 'exclude',
      },
      habitIds: [], pageSize: 2, boundaryConvention: 'start_inclusive_end_exclusive',
    },
    rows: [
      { rank: 1, habitId: '11111111-1111-4111-8111-111111111111', name: 'Water', emoji: '💧', parentHabitId: null, completedCount: 1200 },
      { rank: 2, habitId: '22222222-2222-4222-8222-222222222222', name: 'Walk', emoji: null, parentHabitId: null, completedCount: 20 },
    ],
    totalCount: 4, offset: 0, isComplete: false, nextCursor: 'signed-page-two',
  },
}

export const habitRankingNextPageFixture = {
  ...habitRankingCardFixture.ranking,
  rows: [
    { rank: 3, habitId: '33333333-3333-4333-8333-333333333333', name: 'Read', emoji: '📖', parentHabitId: null, completedCount: 20 },
    { rank: 4, habitId: '44444444-4444-4444-8444-444444444444', name: 'Stretch', emoji: null, parentHabitId: null, completedCount: 1 },
  ],
  offset: 2, isComplete: true, nextCursor: null,
}
