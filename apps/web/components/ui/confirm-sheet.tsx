'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

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
  const t = useTranslations()
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
      <p className="text-sm text-[var(--fg-2)]">{message}</p>
    </Sheet>
  )
}
