import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import en from '@orbit/shared/i18n/en.json'
import { getAccountDay } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { bulkSkipResultSchema, type BulkSkipItemRequest } from '@orbit/shared/types/habit'
import { SelectionTray } from '@/components/habits/selection-tray'
import { ShellWide } from '@/components/shell/shell-wide'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { TodayProvider } from '@/app/(app)/today-provider'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { TodayHeaderRegion, TodayHabitsPanel } from '@/app/(app)/today-page-view'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'

const date = getAccountDay(new Date(), 'UTC')
let items = Array.from({ length: 30 }, (_, index) => makeHabitScheduleItem({
  id: `skip-${index}`, title: `Habit ${index}`, position: index, dueDate: date, scheduledDates: [date],
  children: [], hasSubHabits: false,
}))
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const profile = { ...profileFixture, language: 'en', timeZone: 'UTC' }
client.setQueryData(profileKeys.detail(), profile)
client.setQueryData(habitKeys.count(), items.length)

globalThis.fetch = async (input) => {
  const path = input instanceof Request ? input.url : input.toString()
  const body = path.startsWith(API.habits.list) ? { items, totalCount: items.length, totalPages: 1, page: 1, pageSize: 200 }
    : path === API.profile.get ? profile : null
  if (body === null) throw new Error(`Unexpected fixture read: ${path}`)
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

declare global {
  interface Window {
    skipScrollFixture: (path: string, options: { body: string }) => Promise<unknown>
  }
}
window.skipScrollFixture = async (path, options) => {
  if (path !== API.habits.bulkSkip) throw new Error(`Unexpected fixture write: ${path}`)
  const input = JSON.parse(options.body) as { items: BulkSkipItemRequest[] }
  items = []
  return bulkSkipResultSchema.parse({ results: input.items.map(({ habitId }, index) => ({ index, status: 'Success', habitId, error: null })) })
}

function Fixture() {
  const view = useTodayPage(date, null)
  return <ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }} header={<span>Today</span>}
    tabBar={<BottomTabBar activeId="hoje" label="Navigation" onSelect={() => {}} items={[{ id: 'hoje', href: '/', label: 'Today' }]} />}
    fab={view.isSelectMode ? undefined : <button>Create</button>}
    composer={view.isSelectMode ? <SelectionTray selectedCount={view.selectedHabitIds.size} allSelected={view.selection.allSelected}
      skippableCount={view.selection.skippableCount}
      onSelectAll={view.selection.selectAll} onDeselectAll={view.selection.deselectAll}
      onBulkLog={() => {}} onBulkMove={() => {}} onBulkDelete={() => {}} onCancel={view.toggleSelectMode}
      onBulkSkip={() => { void view.selection.confirmBulkSkip() }} /> : undefined}
    compactComposer={view.isSelectMode ? undefined : <textarea aria-label="Draft" />}>
    <div id="orbit-main" className="flex min-h-full flex-col">
      <TodayHeaderRegion view={view} />
      <TodayHabitsPanel view={view} />
    </div>
  </ShellWide>
}

createRoot(document.getElementById('root')!).render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
  <QueryClientProvider client={client}><TodayProvider><Fixture /></TodayProvider></QueryClientProvider>
</NextIntlClientProvider>)
