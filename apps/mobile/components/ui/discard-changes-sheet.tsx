import { useTranslation } from 'react-i18next'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface DiscardChangesSheetProps {
  message?: string
  open: boolean
  onKeepEditing: () => void
  onKeepEditingStart?: () => void
  onDismissDuringClose?: () => void
  onDiscard: () => void
}

/** Guards an unsaved form: discarding the edit is the irreversible act here. */
export function DiscardChangesSheet({
  open,
  message,
  onKeepEditing,
  onKeepEditingStart,
  onDismissDuringClose,
  onDiscard,
}: Readonly<DiscardChangesSheetProps>) {
  const { t } = useTranslation()

  return (
    <ConfirmSheet
      open={open}
      destructive
      title={t('common.discardChangesTitle')}
      message={message ?? t('common.discardChangesDescription')}
      cancelLabel={t('common.keepEditing')}
      confirmLabel={t('common.discardChangesAction')}
      onCancelStart={onKeepEditingStart}
      onDismissDuringClose={onDismissDuringClose}
      onCloseComplete={onKeepEditingStart ? onKeepEditing : undefined}
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  )
}
