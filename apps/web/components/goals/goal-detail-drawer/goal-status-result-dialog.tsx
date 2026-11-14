'use client'

import { useTranslations } from 'next-intl'
import { ResultDialog } from '@/components/ui/result-dialog'

/** A status change that the goal detail confirms with the result dialog. Mark completed keeps its celebration. */
export type GoalStatusOutcome = 'reactivated' | 'abandoned' | 'deleted'

export interface GoalStatusResult {
  outcome: GoalStatusOutcome
  /** The goal title when the change was saved, so the sentence survives the goal leaving the cache. */
  title: string
  /** The undo of a delete, the same one the toast offers on the current surface. */
  undo?: () => void
}

interface GoalStatusResultDialogProps {
  /** Null draws nothing. */
  result: GoalStatusResult | null
  /** Closes the dialog onto the goal detail. */
  onClose: () => void
  /** Closes the dialog and the detail onto the goals list, after a delete. */
  onOpenList: () => void
}

/** States the saved fact of a reactivate, an abandon or a delete. After an abandon or a delete Orbit is at rest and does not hop. */
export function GoalStatusResultDialog({ result, onClose, onOpenList }: Readonly<GoalStatusResultDialogProps>) {
  const t = useTranslations()
  if (!result) return null
  const deleted = result.outcome === 'deleted'
  const undo = result.undo
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={t(`result.goal.${result.outcome}`, { title: result.title })}
      orbitState={result.outcome === 'reactivated' ? 'feliz' : 'parado'}
      primaryLabel={t(deleted ? 'result.goal.openList' : 'result.goal.open')}
      onPrimary={deleted ? onOpenList : onClose}
      secondaryLabel={deleted && undo ? t('undo.action') : undefined}
      onSecondary={deleted && undo ? () => { undo(); onClose() } : undefined}
      onClose={deleted ? onOpenList : onClose}
    />
  )
}
