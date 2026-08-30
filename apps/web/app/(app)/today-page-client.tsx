'use client'

import { useTodayPage } from './use-today-page'
import {
  TodayHeaderRegion,
  TodayHabitsPanel,
  TodayOverlays,
} from './today-page-view'
import { TodayAstra } from '@/components/today/today-astra'
import type { TodayInitialHabits } from './today-initial-data'

interface TodayPageClientProps {
  initialToday: string
  initialHabits: TodayInitialHabits | null
}

export function TodayPageClient({
  initialToday,
  initialHabits,
}: Readonly<TodayPageClientProps>) {
  const view = useTodayPage(initialToday, initialHabits)

  return (
    <div className="relative">
      <TodayHeaderRegion view={view} />

      <TodayAstra
        isTodaySelected={view.nav.dateStr === view.nav.today}
        suppressed={view.isSelectMode || view.showCreateModal || view.listSurfaceOpen || view.data.isFetching || view.data.showLoadError || view.data.habitsCount === 0}
      />

      <TodayHabitsPanel view={view} />

      <TodayOverlays view={view} />
    </div>
  )
}
