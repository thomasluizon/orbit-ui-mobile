import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import en from '@orbit/shared/i18n/en.json'
import { getAccountDay } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { applyReorderPositions } from '@/lib/habit-mutation-helpers'
import type { ReorderHabitsRequest } from '@orbit/shared/types/habit'
import { HabitList } from '@/components/habits/habit-list'
import { TodayProvider } from '@/app/(app)/today-provider'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'

const date = getAccountDay(new Date(), 'UTC')
const child = makeHabitScheduleItem({ id: 'child', title: 'Child', children: [], hasSubHabits: false, dueDate: date, scheduledDates: [date] })
let items = Array.from({ length: 5 }, (_, position) => makeHabitScheduleItem({
  id: `root-${position}`, title: `Habit ${position}`, position, dueDate: date, scheduledDates: [date],
  children: position === 0 ? [child] : [], hasSubHabits: position === 0,
}))
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const profile = { ...profileFixture, language: 'en', timeZone: 'UTC' }
client.setQueryData(profileKeys.detail(), profile)
client.setQueryData(habitKeys.count(), 6)

globalThis.fetch = async (input) => {
  const path = input instanceof Request ? input.url : input.toString()
  const body = path.startsWith(API.habits.list) ? { items, totalCount: items.length, totalPages: 1, page: 1, pageSize: 200 }
    : path === API.profile.get ? profile : null
  if (body === null) throw new Error(`Unexpected fixture read: ${path}`)
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

declare global {
  interface Window {
    reorderFixture: (path: string, options: { body: string }) => Promise<void>
    reloadReorderFixture: () => Promise<void>
    reorderRequests: ReorderHabitsRequest[]
  }
}
window.reorderRequests = []
window.reorderFixture = async (path, options) => {
  if (path !== API.habits.reorder) throw new Error(`Unexpected fixture write: ${path}`)
  const request = JSON.parse(options.body) as ReorderHabitsRequest
  window.reorderRequests.push(request)
  items = applyReorderPositions(items, request.positions)
}
window.reloadReorderFixture = async () => {
  client.removeQueries({ queryKey: habitKeys.lists() })
  mount()
}
const root = createRoot(document.getElementById('root')!)
let generation = 0
function mount() {
  root.render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <QueryClientProvider client={client}><TodayProvider>
      <div data-shell-scroller style={{ height: '100dvh', overflow: 'auto', paddingTop: 24 }}>
        <HabitList key={generation++} view="today" filters={{ dateFrom: date, dateTo: date, includeOverdue: true }} />
      </div>
    </TodayProvider></QueryClientProvider>
  </NextIntlClientProvider>)
}
mount()
