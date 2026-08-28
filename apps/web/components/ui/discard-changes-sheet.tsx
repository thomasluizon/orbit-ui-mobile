'use client'

import { useTranslations } from 'next-intl'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface DiscardChangesSheetProps {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}

/** Guards an unsaved form: discarding the edit is the irreversible act here. */
export function DiscardChangesSheet({
  open,
  onKeepEditing,
  onDiscard,
}: Readonly<DiscardChangesSheetProps>) {
  const t = useTranslations()

  return (
    <ConfirmSheet
      open={open}
      title={t('common.discardChangesTitle')}
      message={t('common.discardChangesDescription')}
      cancelLabel={t('common.keepEditing')}
      confirmLabel={t('common.discard')}
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  )
}
