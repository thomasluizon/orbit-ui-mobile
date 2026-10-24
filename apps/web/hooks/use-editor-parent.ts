'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { findCachedHabitDetail } from '@orbit/shared/query'
import type { HabitDetail, NormalizedHabit } from '@orbit/shared/types/habit'
import { buildEditorParentChange, buildMoveParentOptions, getMoveParentInventory, validateEditorParent } from '@orbit/shared/utils/move-parent'
import { useHabits } from './use-habit-queries'
import { useConfig } from './use-config'

export function useEditorParent(habit: NormalizedHabit | null, detail: HabitDetail | undefined, isGeneral: boolean, previousConstraint: boolean | null, t: (key: string, values?: Record<string, number>) => string) {
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  const [chosen, setChosen] = useState<{ id: string | null; label: string; isGeneral: boolean | null } | undefined>(undefined)
  const queryClient = useQueryClient()
  const baseline = habit?.id.startsWith('offline-habit-') ? habit.parentId : detail?.parentId
  const selected = chosen === undefined ? baseline : chosen.id
  const cachedParent = selected ? findCachedHabitDetail(queryClient, selected) : undefined
  const enabled = requested || (typeof selected === 'string' && !cachedParent && !chosen)
  const scheduled = useHabits({}, undefined, { enabled })
  const general = useHabits({ isGeneral: true }, undefined, { enabled })
  const inventory = getMoveParentInventory(scheduled, general)
  const { config } = useConfig()
  const change = buildEditorParentChange(baseline, chosen?.id)
  const dirty = Object.keys(change).length > 0
  const state = inventory.state ?? (baseline === undefined || !habit || !inventory.habitsById.has(habit.id) ? 'error' : undefined)
  const deps = { ...inventory, maxHabitDepth: config.limits.maxHabitDepth, t }
  const validate = (target: string | null, source: string) => validateEditorParent(deps, target, source, isGeneral)
  const options = state || !habit ? [] : buildMoveParentOptions({ ...deps, selectionOnly: true, includeCompleted: true, validateMoveTarget: validate }, habit.id)
  const parentGeneral = selected ? inventory.habitsById.get(selected)?.isGeneral ?? chosen?.isGeneral : null
  const lockedGeneral = detail?.children[0]?.isGeneral ?? parentGeneral ?? (chosen === undefined && baseline !== null ? previousConstraint : null)
  const value = selected === undefined ? t('common.unknown') : selected === null ? t('habits.moveParent.toRoot')
    : inventory.habitsById.get(selected)?.title ?? cachedParent?.title ?? chosen?.label ?? t('habits.moveParent.currentParent')
  return {
    open, selected, baseline, options, state, value, dirty, change, lockedGeneral,
    show: () => { setRequested(true); setOpen(true) },
    close: () => setOpen(false),
    select: (id: string | null) => {
      const option = options.find((candidate) => candidate.id === id && !candidate.disabled)
      if (option) setChosen({ id, label: option.label, isGeneral: id === null ? null : inventory.habitsById.get(id)!.isGeneral })
    },
    retry: () => Promise.all([scheduled.refetch(), general.refetch()]),
    prepare: (finalIsGeneral: boolean, currentBaseline: HabitDetail['parentId']) => {
      const change = buildEditorParentChange(currentBaseline, chosen?.id)
      if (Object.keys(change).length === 0) return { change, error: null }
      if (inventory.state || currentBaseline === undefined || chosen === undefined || !habit) return { change, error: t('habits.loadError') }
      return { change, error: validateEditorParent(deps, chosen.id, habit.id, finalIsGeneral).reason }
    },
  }
}
