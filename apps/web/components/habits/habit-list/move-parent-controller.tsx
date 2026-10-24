'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { BulkMoveHabitParentResult, NormalizedHabit } from '@orbit/shared/types/habit'
import { createMoveParentActions, createMoveParentState } from '@orbit/shared/hooks/move-parent-core'
import { getMoveParentInventory, getMoveParentSelection, getSharedMoveParentId, validateMoveTarget } from '@orbit/shared/utils/move-parent'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useHabits, useMoveHabitParent } from '@/hooks/use-habits'
import { useConfig } from '@/hooks/use-config'
import { getAccountGeneration } from '@/lib/session-epoch'
import { MoveParentOverlay } from './move-parent-overlay'

export interface MoveParentIntent {
  key: number
  accountGeneration: number
  habitId: string | null
  bulkIds: string[] | null
  sourceHabits: ReadonlyMap<string, NormalizedHabit>
}

interface MoveParentControllerProps {
  intent: MoveParentIntent
  onBulkMove?: (habitIds: string[], parentId: string | null) => Promise<BulkMoveHabitParentResult | undefined>
  onClose: () => void
}

export function MoveParentController({ intent, onBulkMove, onClose }: Readonly<MoveParentControllerProps>) {
  const t = useTranslations()
  const { config } = useConfig()
  const maxHabitDepth = config.limits.maxHabitDepth
  const [state, setState] = useState(() => ({
    ...createMoveParentState(), open: true, habitId: intent.habitId, bulkIds: intent.bulkIds,
    selectedParentId: getSharedMoveParentId(intent.sourceHabits, intent.bulkIds ?? [intent.habitId!]),
  }))
  const operation = useRef<object | null>(null)
  useLayoutEffect(() => {
    operation.current = state.operation
    return () => { operation.current = null }
  }, [state.operation])
  const scheduledQuery = useHabits({}, undefined, { enabled: true })
  const generalQuery = useHabits({ isGeneral: true }, undefined, { enabled: true })
  const inventory = getMoveParentInventory(scheduledQuery, generalQuery)
  const retryInventory = () => { void scheduledQuery.refetch(); void generalQuery.refetch() }
  const moveSingle = useMoveHabitParent()
  const { moveIds, sharedMoveParentId, moveParentOptions, selectedMoveOption, inventoryState } = getMoveParentSelection(
    { ...inventory, maxHabitDepth, t, validateMoveTarget: (target, source) =>
      validateMoveTarget({ ...inventory, maxHabitDepth, t }, target, source) },
    state.bulkIds ?? state.habitId, state.selectedParentId, state.targetChosen,
  )
  const canSubmit = !inventoryState && state.targetChosen && moveIds.length > 0 && !state.pending &&
    selectedMoveOption !== null && !selectedMoveOption.disabled
  const { confirm, select } = createMoveParentActions({
    state, applyState: setState, habitsById: inventory.habitsById, selectedHabitIds: undefined,
    canSubmit, getAccountGeneration, moveBulk: onBulkMove,
    moveSingle: (habitId, parentId) => moveSingle.mutateAsync({ habitId, data: { parentId } }),
    partialError: t('habits.moveParent.errorPartial'),
    formatError: (error) => getFriendlyErrorMessage(error, t, 'habits.moveParent.errorPartial'),
  })
  const confirmCurrent = () => confirm(() => operation.current === state.operation && getAccountGeneration() === intent.accountGeneration)

  return <MoveParentOverlay t={t} open isMoving={state.pending}
    movingHabitTitle={inventory.habitsById.get(intent.habitId ?? '')?.title ?? intent.sourceHabits.get(intent.habitId ?? '')?.title ?? null}
    movingHabitParentId={sharedMoveParentId} movingHabitCount={state.bulkIds?.length}
    error={state.error} inventoryState={inventoryState} onRetryInventory={retryInventory}
    options={moveParentOptions} selectedMoveParentId={state.selectedParentId} canSubmit={canSubmit}
    onClose={onClose} onConfirm={confirmCurrent} onSelectOption={select} />
}
