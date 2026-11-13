'use client'

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
 * The root figures that changed since the person last saw them on this device. The comparison runs once, on
 * mount, so a figure that changes while the person reads it never rolls. Each value the person sees is kept.
 */
export function useChangedProgressFigures(metrics: Pick<RetrospectiveMetrics, 'completionRate' | 'activeDays' | 'weeklyConsistency'>): ReadonlySet<ProgressFigureKey> {
  const ready = useUIPreferencesReadiness((state) => state.ready)
  const { completionRate, activeDays, bestWeekday } = readProgressFigures(metrics)
  const [changed] = useState(() => ready
    ? changedProgressFigures(useUIStore.getState().progressFiguresSeen, { completionRate, activeDays, bestWeekday })
    : NOTHING_CHANGED)
  useEffect(() => {
    if (ready) useUIStore.getState().setProgressFiguresSeen({ completionRate, activeDays, bestWeekday })
  }, [ready, completionRate, activeDays, bestWeekday])
  return changed
}
