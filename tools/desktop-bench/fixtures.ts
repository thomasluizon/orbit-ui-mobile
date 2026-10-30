import { writeFileSync } from 'node:fs'
import { makeHabitScheduleItem } from '../../packages/shared/src/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '../../packages/shared/src/types/habit'
import { mintHermeticJwt } from '../../apps/web/test-support/hermetic/hermetic-session'
import { profileFixture } from '../../apps/web/test-support/hermetic/mock-api/fixtures/profile'

const today = new Date().toLocaleDateString('en-CA')
const items = Array.from({ length: 200 }, (_, index) => makeHabitScheduleItem({
  id: `bench-${String(index).padStart(4, '0')}`, title: `Habit ${index + 1}`, tags: [], children: [], hasSubHabits: false,
  position: index, scheduledDates: [today], dueDate: today, dueTime: null,
}))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items, page: 1, pageSize: 200, totalCount: 200, totalPages: 1 })
const token = mintHermeticJwt({ ...profileFixture, language: 'en', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, [], [], 'desktop-bench')
writeFileSync(process.argv[2], JSON.stringify({ token, fixtures: [{ path: '/api/habits', body: habits }, { path: '/api/habits/count', body: { count: 200 } }] }))
