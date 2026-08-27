import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet } from '@/components/ui/sheet'

interface DiscardChangesSheetProps {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}

export function DiscardChangesSheet({
  open,
  onKeepEditing,
  onDiscard,
}: Readonly<DiscardChangesSheetProps>) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <Sheet
      open
      title={t('common.discardChangesTitle')}
      onClose={onKeepEditing}
      actions={
        <>
          <PillButton variant="ghost" onClick={onKeepEditing}>
            {t('common.keepEditing')}
          </PillButton>
          <PillButton variant="primary" onClick={onDiscard}>
            {t('common.discard')}
          </PillButton>
        </>
      }
    >
      <Text>{t('common.discardChangesDescription')}</Text>
    </Sheet>
  )
}
