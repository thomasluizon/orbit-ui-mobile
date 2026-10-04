'use client'

import { useTranslations } from 'next-intl'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface DiscardChangesSheetProps {
  open: boolean
  onKeepEditing: () => void
  onKeepEditingStart?: () => void
  onDiscard: () => void
}

/** Guards an unsaved form: discarding the edit is the irreversible act here. */
export function DiscardChangesSheet({
  open,
  onKeepEditing,
  onKeepEditingStart,
  onDiscard,
}: Readonly<DiscardChangesSheetProps>) {
  const t = useTranslations()

  return (
    <ConfirmSheet
      open={open}
      destructive
      title={t('common.discardChangesTitle')}
      message={t('common.discardChangesDescription')}
      cancelLabel={t('common.keepEditing')}
      confirmLabel={t('common.discardChangesAction')}
      onCancelStart={onKeepEditingStart}
      onCloseComplete={onKeepEditingStart ? onKeepEditing : undefined}
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  )
}
