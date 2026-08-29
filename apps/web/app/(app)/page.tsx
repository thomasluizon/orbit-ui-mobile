'use client'

import { useTodayPage } from './use-today-page'
import {
  TodayHeaderRegion,
  TodayHabitsPanel,
  TodayOverlays,
} from './today-page-view'
import { TodayAstra } from '@/components/today/today-astra'

export default function TodayPage() {
  const view = useTodayPage()

  return (
    <div className="relative">
      <TodayHeaderRegion view={view} />

      <TodayAstra
        habitsById={view.data.habitsById}
        today={view.nav.today}
        isTodaySelected={view.nav.dateStr === view.nav.today}
        suppressed={view.isSelectMode || view.listSurfaceOpen || view.data.isFetching || view.data.showLoadError || view.data.habitsCount === 0}
      />

      <TodayHabitsPanel view={view} />

      <TodayOverlays view={view} />
    </div>
  )
}
