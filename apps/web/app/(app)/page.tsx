'use client'

import { useTodayPage } from './use-today-page'
import {
  TodayHeaderRegion,
  TodayHabitsPanel,
  TodayOverlays,
} from './today-page-view'

export default function TodayPage() {
  const view = useTodayPage()

  return (
    <div className="relative">
      <TodayHeaderRegion view={view} />

      <TodayHabitsPanel view={view} />

      <TodayOverlays view={view} />
    </div>
  )
}
