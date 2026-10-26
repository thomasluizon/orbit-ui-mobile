import { makeHabitScheduleItem } from './habit-detail-fixtures'

export const habitMonthFixture = {
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
  today: '2026-09-11',
  weekStartDay: 1,
  language: 'en',
  surfaceId: 'calendar',
  calendar: {
    habits: [makeHabitScheduleItem({
      id: 'habit-one', title: 'Walk', children: [], hasSubHabits: false,
      scheduledDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-11', '2026-09-12'],
      instances: [
        { date: '2026-09-01', status: 'Completed', logId: 'done' },
        { date: '2026-09-02', status: 'Overdue', logId: null },
        { date: '2026-09-03', status: 'Completed', logId: 'skip' },
        { date: '2026-09-11', status: 'Pending', logId: null },
        { date: '2026-09-12', status: 'Pending', logId: null },
      ],
    })],
    logs: {
      'habit-one': [
        { id: 'done', date: '2026-09-01', value: 1, createdAtUtc: '2026-09-01T12:00:00Z' },
        { id: 'skip', date: '2026-09-03', value: 0, createdAtUtc: '2026-09-03T12:00:00Z' },
      ],
    },
  },
  read: {
    queryId: '11111111-1111-4111-8111-111111111111',
    queryFamily: 'get_habit_month',
    scope: { date_from: '2026-09-01', date_to: '2026-09-30' },
    revision: 'one', completeness: 'complete', refreshToken: 'signed-month',
  },
} as const
