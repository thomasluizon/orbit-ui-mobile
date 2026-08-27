import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, unknown>) => string
  showDeleteConfirm: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

/**
 * The habit deletion confirmation owned by HabitList. Deleting is the only
 * irreversible act in the row, so it is the only one that asks (#42).
 */
export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<HabitListConfirmDialogsProps>) {
  return (
    <ConfirmSheet
      open={showDeleteConfirm}
      title={t('habits.deleteConfirmTitle')}
      message={t('habits.deleteConfirmMessage')}
      confirmLabel={t('common.delete')}
      destructive
      onCancel={onCancelDelete}
      onConfirm={onConfirmDelete}
    />
  )
}
