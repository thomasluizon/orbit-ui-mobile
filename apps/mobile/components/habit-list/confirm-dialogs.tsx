
import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { Text } from 'react-native'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, unknown>) => string
  showDeleteConfirm: boolean
  onDeleteOpenChange: (open: boolean) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

/** The irreversible habit deletion confirmation owned by HabitList. */
export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  onDeleteOpenChange,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<HabitListConfirmDialogsProps>) {
  if (!showDeleteConfirm) return null

  return (
    <Sheet
      open
      title={t('habits.deleteConfirmTitle')}
      onClose={() => onDeleteOpenChange(false)}
      actions={(
        <>
          <PillButton variant="ghost" onClick={onCancelDelete}>
            {t('common.cancel')}
          </PillButton>
          <PillButton variant="destructive" onClick={onConfirmDelete}>
            {t('common.delete')}
          </PillButton>
        </>
      )}
    >
      <Text>{t('habits.deleteConfirmMessage')}</Text>
    </Sheet>
  )
}
