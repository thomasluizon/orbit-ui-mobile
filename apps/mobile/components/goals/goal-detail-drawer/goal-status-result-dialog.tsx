import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResultDialog } from '@/components/ui/result-dialog'

/** A status change that the goal detail confirms with the result dialog. Mark completed keeps its celebration. */
export type GoalStatusOutcome = 'reactivated' | 'abandoned' | 'deleted'

export interface GoalStatusResult {
  outcome: GoalStatusOutcome
  /** The goal title when the change was saved, so the sentence survives the goal leaving the cache. */
  title: string
  /** The undo of a delete, the same one the toast offers on the current surface. */
  undo?: () => void
  /** Releases what the undo holds when the dialog closes without it, as the toast does when it leaves. */
  release?: () => void
}

interface GoalStatusResultDialogProps {
  result: GoalStatusResult | null
  held?: boolean
  onDismissed?: () => void
  onClose: () => void
  onOpenList: () => void
}

/** States the saved fact of a reactivate, an abandon or a delete. After an abandon or a delete Orbit is at rest and does not hop. */
export function GoalStatusResultDialog({ result, held = false, onDismissed, onClose, onOpenList }: Readonly<GoalStatusResultDialogProps>) {
  const { t } = useTranslation()
  const [lastResult, setLastResult] = useState(result)
  if (result && result !== lastResult) setLastResult(result)
  const shown = result ?? (held ? lastResult : null)
  if (!shown) return null
  const deleted = shown.outcome === 'deleted'
  const { undo, release } = shown
  const leaveToList = () => { release?.(); onOpenList() }
  return (
    <ResultDialog
      visible={result !== null}
      onDismissed={onDismissed}
      title={t('result.title')}
      sentence={t(`result.goal.${shown.outcome}`, { title: shown.title })}
      orbitState={shown.outcome === 'reactivated' ? 'feliz' : 'parado'}
      primaryLabel={t(deleted ? 'result.goal.openList' : 'result.goal.open')}
      onPrimary={deleted ? leaveToList : onClose}
      secondaryLabel={deleted && undo ? t('undo.action') : undefined}
      onSecondary={deleted && undo ? () => { undo(); onClose() } : undefined}
      onClose={deleted ? leaveToList : onClose}
    />
  )
}
