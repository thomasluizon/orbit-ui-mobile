import { useEffect, useState } from 'react'
import {
  changedProgressFigures,
  readProgressFigures,
  type ProgressFigureKey,
} from '@orbit/shared/utils'
import type { RetrospectiveMetrics } from '@orbit/shared/utils/retrospective'
import { useUIPreferencesReadiness, useUIStore } from '@/stores/ui-store'

const NOTHING_CHANGED: ReadonlySet<ProgressFigureKey> = new Set()

/**
 * The root figures that changed since the person last saw them on this device. The comparison runs once per
 * mount, as soon as the stored preferences are ready, so a figure that changes while the person reads it never
 * rolls. The values the person sees are kept only after that comparison.
 */
export function useChangedProgressFigures(metrics: Pick<RetrospectiveMetrics, 'completionRate' | 'activeDays' | 'weeklyConsistency'>): ReadonlySet<ProgressFigureKey> {
  const ready = useUIPreferencesReadiness((state) => state.ready)
  const { completionRate, activeDays, bestWeekday } = readProgressFigures(metrics)
  const [changed, setChanged] = useState<ReadonlySet<ProgressFigureKey> | null>(null)
  if (ready && changed === null) setChanged(changedProgressFigures(useUIStore.getState().progressFiguresSeen, { completionRate, activeDays, bestWeekday }))
  const compared = changed !== null
  useEffect(() => {
    if (compared) useUIStore.getState().setProgressFiguresSeen({ completionRate, activeDays, bestWeekday })
  }, [compared, completionRate, activeDays, bestWeekday])
  return changed ?? NOTHING_CHANGED
}
