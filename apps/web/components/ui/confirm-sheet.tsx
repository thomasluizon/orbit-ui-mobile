'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ConfirmSheetProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  minimumActionHeight?: number
  /** Marks the confirm action as the destructive one. */
  destructive?: boolean
  inlineActions?: boolean
  /** Starts the action on press while the controlled sheet closes. */
  confirmImmediately?: boolean
  loading?: boolean
  onCloseComplete?: () => void
  /** Runs after the sheet is gone when the person cancels. It has to hide the sheet. */
  onCancel: () => void
  /** Confirms the action and hides the sheet, on press when confirmImmediately is set. */
  onConfirm: () => void
}

/** The confirmation surface for actions that cannot currently be undone. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  minimumActionHeight,
  destructive = false,
  inlineActions = false,
  confirmImmediately = false,
  loading = false,
  onCloseComplete,
  onCancel,
  onConfirm,
}: Readonly<ConfirmSheetProps>) {
  const t = useTranslations()
  const isDesktop = useIsDesktop()
  const { sheetRef, closeSheet } = useSheetHost()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCloseCompleteRef = useRef(onCloseComplete)
  useEffect(() => { onCloseCompleteRef.current = onCloseComplete }, [onCloseComplete])
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
    onCloseCompleteRef.current?.()
  }, [])

  useEffect(() => {
    if (lifecycle.closing) closeSheet(finishControlledClose)
  }, [lifecycle.closing, closeSheet, finishControlledClose])

  if (!lifecycle.mounted) return null

  const actionsDisabled = lifecycle.closing || !open || loading
  const cancel = () => {
    if (actionsDisabled) return
    closeSheet()
  }
  const confirm = () => {
    if (actionsDisabled) return
    if (confirmImmediately) {
      onConfirm()
      return
    }
    closeSheet(() => { setLifecycle((current) => ({ ...current, mounted: false })); onConfirm() })
  }
  const cancelButton = (
    <PillButton variant="ghost" size="sm" minimumHeight={minimumActionHeight} buttonRef={cancelRef} disabled={actionsDisabled} onClick={cancel}>
      {cancelLabel ?? t('common.cancel')}
    </PillButton>
  )
  const confirmButton = (
    <PillButton
      variant={destructive ? 'destructive' : inlineActions && isDesktop ? 'secondary' : 'primary'}
      size="sm"
      minimumHeight={minimumActionHeight}
      disabled={actionsDisabled}
      loading={loading}
      onClick={confirm}
    >
      {confirmLabel}
    </PillButton>
  )

  return (
    <Sheet
      key={lifecycle.generation}
      ref={sheetRef}
      initialFocus={destructive ? cancelRef : undefined}
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
          {cancelButton}{confirmButton}
        </>
      }
    >
      <p className="break-words text-sm text-[var(--fg-2)]">{message}</p>
    </Sheet>
  )
}
