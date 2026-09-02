import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { plural } from '@/lib/plural'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, unknown>) => string
  showDeleteConfirm: boolean
  deleteHabitName: string
  deleteDescendantCount: number
  duplicateHabitName: string | null
  parentPrompt: { id: string; name: string; mode: 'log' | 'skip' } | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
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
  deleteHabitName,
  deleteDescendantCount,
  duplicateHabitName,
  parentPrompt,
  onConfirmDelete,
  onCancelDelete,
  onConfirmDuplicate,
  onCancelDuplicate,
  onConfirmParent,
  onCancelParent,
}: Readonly<HabitListConfirmDialogsProps>) {
  return (
    <>
      <ConfirmSheet
        open={duplicateHabitName !== null}
        title={t('habits.duplicateConfirmTitle')}
        message={t('habits.duplicateConfirmMessage', { name: duplicateHabitName ?? '' })}
        confirmLabel={t('habits.duplicateConfirm')}
        onCancel={onCancelDuplicate}
        onConfirm={onConfirmDuplicate}
      />
      <ConfirmSheet
        key={parentPrompt?.id ?? 'parent-prompt'}
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
        message={plural(
          t('habits.deleteListConfirmMessage', {
            name: deleteHabitName,
            count: deleteDescendantCount,
          }),
          deleteDescendantCount,
        )}
        confirmLabel={t('common.delete')}
        destructive
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </>
  )
}
