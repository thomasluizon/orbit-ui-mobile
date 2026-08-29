'use client'

import { useTodayPage } from './use-today-page'
import {
  TodayHeaderRegion,
  TodayHabitsPanel,
  TodayOverlays,
} from './today-page-view'
import type { TodayInitialHabits } from './today-initial-data'

interface TodayPageClientProps {
  initialHabits: TodayInitialHabits | null
}

export function TodayPageClient({ initialHabits }: Readonly<TodayPageClientProps>) {
  const view = useTodayPage(initialHabits)

  return (
    <div className="relative">
      <TodayHeaderRegion view={view} />

      <TodayHabitsPanel view={view} />

      <TodayOverlays view={view} />
    </div>
  )
}
