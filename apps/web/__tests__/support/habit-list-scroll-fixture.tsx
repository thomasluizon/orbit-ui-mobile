import { createRoot } from 'react-dom/client'
import { useCallback, useRef } from 'react'
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
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
import { Composer } from '@/components/shell/composer'
import { useUIStore } from '@/stores/ui-store'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { TodayProvider } from '@/app/(app)/today-provider'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { TodayHabitsPanel, TodayHeaderRegion } from '@/app/(app)/today-page-view'
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
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  items = []
  return bulkSkipResultSchema.parse({ results: input.items.map(({ habitId }, index) => ({ index, status: 'Success', habitId, error: null })) })
}

function Fixture() {
  const headerHost = useRef<HTMLDivElement>(null)
  const registerHeaderHost = useCallback((element: HTMLDivElement | null) => { headerHost.current = element }, [])
  const view = useTodayPage(date, null)
  const selecting = view.isSelectMode
  const fabHidden = useUIStore((state) => state.todayFabHidden)
  return <ShellHeaderHostContext.Provider value={headerHost}><ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }} registerHeaderHost={registerHeaderHost}
    tabBar={<BottomTabBar activeId="hoje" label="Navigation" onSelect={() => {}} items={[{ id: 'hoje', href: '/', label: 'Today' }]} />}
    fab={selecting || fabHidden ? undefined : <button>Create</button>}
    composer={selecting ? <SelectionTray selectedCount={view.selectedHabitIds.size} allSelected={view.selection.allSelected}
      skippableCount={view.selection.skippableCount}
      onSelectAll={view.selection.selectAll} onDeselectAll={view.selection.deselectAll} onBulkLog={() => {}}
      onBulkMove={() => {}} onBulkDelete={() => {}} onCancel={view.toggleSelectMode}
      onBulkSkip={() => { void view.selection.confirmBulkSkip() }} /> : undefined}
    compactComposer={selecting ? undefined : <Composer state="idle" words={en.shell.composer} value="" onChangeValue={() => {}} onSend={() => {}} suggestions={[]} collapsible collapseScope="today" />}>
    <div id="orbit-main" className="flex min-h-full flex-col gap-6">
      <TodayHeaderRegion view={view} />
      <TodayHabitsPanel view={view} />
    </div>
  </ShellWide></ShellHeaderHostContext.Provider>
}

createRoot(document.getElementById('root')!).render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
  <QueryClientProvider client={client}><TodayProvider><Fixture /></TodayProvider></QueryClientProvider>
</NextIntlClientProvider>)
