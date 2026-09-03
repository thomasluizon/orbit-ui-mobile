import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ConfirmSheetProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  /** Marks the confirm action as the destructive one. */
  destructive?: boolean
  /** Runs after the sheet is gone when the person cancels. It has to hide the sheet. */
  onCancel: () => void
  /** Runs after the sheet is gone when the person confirms. It has to hide the sheet. */
  onConfirm: () => void
}

/**
 * The one confirmation surface. A confirmation belongs to an irreversible act
 * only, so a reversible one acts at once and never renders this (#42).
 */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: Readonly<ConfirmSheetProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { sheetRef, closeSheet } = useSheetHost()

  if (!open) return null

  return (
    <Sheet
      ref={sheetRef}
      open
      title={title}
      onClose={onCancel}
      actions={
        <>
          <PillButton variant="ghost" onClick={() => closeSheet()}>
            {cancelLabel ?? t('common.cancel')}
          </PillButton>
          <PillButton
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => closeSheet(onConfirm)}
          >
            {confirmLabel}
          </PillButton>
        </>
      }
    >
      <Text style={[styles.message, { color: tokens.fg2 }]}>{message}</Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  message: { fontFamily: 'Geist_400Regular', fontSize: 15, lineHeight: 22 },
})
