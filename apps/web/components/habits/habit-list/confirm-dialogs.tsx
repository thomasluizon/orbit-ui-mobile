'use client'

import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, string | number | Date>) => string
  showDeleteConfirm: boolean
  skipHabitName: string | null
  skipKind: 'recurring' | 'flexible' | 'one-time'
  duplicateHabitName: string | null
  parentPrompt: { name: string; mode: 'log' | 'skip' } | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onConfirmSkip: () => void
  onCancelSkip: () => void
  onConfirmDuplicate: () => void
  onCancelDuplicate: () => void
  onConfirmParent: () => void
  onCancelParent: () => void
}

/**
 * The habit deletion confirmation owned by HabitList. Deleting is the only
 * irreversible act in the row, so it is the only one that asks (#42).
 */
export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  skipHabitName,
  skipKind,
  duplicateHabitName,
  parentPrompt,
  onConfirmDelete,
  onCancelDelete,
  onConfirmSkip,
  onCancelSkip,
  onConfirmDuplicate,
  onCancelDuplicate,
  onConfirmParent,
  onCancelParent,
}: Readonly<HabitListConfirmDialogsProps>) {
  return (
    <>
      <ConfirmSheet
        open={skipHabitName !== null}
        title={t(skipKind === 'one-time' ? 'habits.postponeConfirmTitle' : 'habits.skipConfirmTitle')}
        message={t(skipKind === 'one-time'
          ? 'habits.postponeConfirmMessage'
          : skipKind === 'flexible'
            ? 'habits.skipConfirmMessageFlexible'
            : 'habits.skipConfirmMessage')}
        confirmLabel={t(skipKind === 'one-time' ? 'habits.postponeConfirmButton' : 'habits.skipConfirmButton')}
        onCancel={onCancelSkip}
        onConfirm={onConfirmSkip}
      />
      <ConfirmSheet
        open={duplicateHabitName !== null}
        title={t('habits.duplicateConfirmTitle')}
        message={t('habits.duplicateConfirmMessage', { name: duplicateHabitName ?? '' })}
        confirmLabel={t('habits.duplicateConfirm')}
        onCancel={onCancelDuplicate}
        onConfirm={onConfirmDuplicate}
      />
      <ConfirmSheet
        open={parentPrompt !== null}
        title={t(parentPrompt?.mode === 'skip' ? 'habits.autoSkipParentTitle' : 'habits.autoLogParentTitle')}
        message={t(parentPrompt?.mode === 'skip' ? 'habits.autoSkipParentMessage' : 'habits.autoLogParentMessage', { name: parentPrompt?.name ?? '' })}
        confirmLabel={t(parentPrompt?.mode === 'skip' ? 'habits.autoSkipParentConfirm' : 'habits.autoLogParentConfirm')}
        cancelLabel={t('common.notNow')}
        onCancel={onCancelParent}
        onConfirm={onConfirmParent}
      />
      <ConfirmSheet
        open={showDeleteConfirm}
        title={t('habits.deleteConfirmTitle')}
        message={t('habits.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        destructive
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </>
  )
}
