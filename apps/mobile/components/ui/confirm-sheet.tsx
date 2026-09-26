import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useCallback, useEffect, useState } from 'react'
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
  const [lifecycle, setLifecycle] = useState({
    lastOpen: open, mounted: open, closing: false, generation: 0,
  })
  if (open !== lifecycle.lastOpen) {
    setLifecycle({
      ...lifecycle,
      lastOpen: open,
      mounted: open || lifecycle.mounted,
      closing: lifecycle.closing || (!open && lifecycle.mounted),
    })
  }

  const finishControlledClose = useCallback(() => {
    setLifecycle((current) => current.closing ? ({
      ...current,
      mounted: current.lastOpen,
      closing: false,
      generation: current.lastOpen ? current.generation + 1 : current.generation,
    }) : current)
  }, [])

  useEffect(() => {
    // WHY: a rejected dismiss() must still finish the close; unmounting drops and dismisses the native view. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/android/src/main/java/com/lodev09/truesheet/TrueSheetView.kt#L165-L179
    if (lifecycle.closing) closeSheet(finishControlledClose, finishControlledClose)
  }, [lifecycle.closing, closeSheet, finishControlledClose])

  if (!lifecycle.mounted) return null

  const actionsDisabled = lifecycle.closing || !open
  const cancel = () => {
    if (actionsDisabled) return
    closeSheet()
  }
  const confirm = () => {
    if (actionsDisabled) return
    closeSheet(() => { setLifecycle((current) => ({ ...current, mounted: false })); onConfirm() })
  }

  return (
    <Sheet
      key={lifecycle.generation}
      ref={sheetRef}
      open
      title={title}
      onClose={() => {
        if (actionsDisabled) {
          finishControlledClose()
          return
        }
        setLifecycle((current) => ({ ...current, mounted: false }))
        onCancel()
      }}
      actions={
        <>
          <PillButton variant="ghost" disabled={actionsDisabled} onClick={cancel}>
            {cancelLabel ?? t('common.cancel')}
          </PillButton>
          <PillButton
            variant={destructive ? 'destructive' : 'primary'}
            disabled={actionsDisabled}
            onClick={confirm}
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
