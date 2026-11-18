'use client'

import type { ReactNode } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { useTranslations } from 'next-intl'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ConfirmSheetProps {
  open: boolean
  title: string
  titleMode?: SheetProps['titleMode']
  children?: ReactNode
  confirmDisabled?: boolean
  message: string
  confirmLabel: string
  cancelLabel?: string
  minimumActionHeight?: number
  destructive?: boolean
  inlineActions?: boolean
  quickOptions?: boolean
  freePathLabel?: string
  confirmImmediately?: boolean
  loading?: boolean
  onCloseComplete?: () => void
  onCancelStart?: () => void
  onCancel: () => void
  onConfirm: () => void
}

/** The confirmation surface for actions that cannot currently be undone. */
export function ConfirmSheet({
  open,
  title,
  titleMode = 'label',
  message,
  children,
  confirmDisabled = false,
  confirmLabel,
  cancelLabel,
  minimumActionHeight,
  destructive = false,
  inlineActions = false,
  quickOptions = false,
  freePathLabel,
  confirmImmediately = false,
  loading = false,
  onCloseComplete,
  onCancelStart,
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
      generation: current.generation + 1,
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
    if (onCancelStart) onCancelStart()
    else closeSheet()
  }
  const confirm = () => {
    if (actionsDisabled || confirmDisabled) return
    if (confirmImmediately) {
      onConfirm()
      return
    }
    closeSheet(() => { setLifecycle((current) => ({ ...current, mounted: false })); onConfirm() })
  }
  const cancelButton = (
    <PillButton variant="ghost" size="sm" minimumHeight={minimumActionHeight} buttonRef={cancelRef} disabled={actionsDisabled} onClick={cancel}>{cancelLabel ?? t('common.cancel')}</PillButton>
  )
  const confirmButton = (
    <PillButton
      variant={destructive ? 'destructive' : inlineActions && isDesktop ? 'secondary' : 'primary'}
      size="sm"
      minimumHeight={minimumActionHeight}
      disabled={actionsDisabled || confirmDisabled}
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
      titleMode={titleMode}
      onClose={() => {
        if (actionsDisabled) {
          finishControlledClose()
          return
        }
        setLifecycle((current) => ({ ...current, mounted: false }))
        onCancel()
      }}
      actions={quickOptions ? undefined : (
        <>
          {cancelButton}{confirmButton}
        </>
      )}
    >
      {quickOptions ? (
        <QuestionBody title={title} message={message} confirmLabel={confirmLabel} cancelLabel={cancelLabel ?? t('common.notNow')} freePathLabel={freePathLabel} answersDisabled={actionsDisabled} confirmDisabled={actionsDisabled || confirmDisabled} confirmLoading={loading} onConfirm={confirm} onCancel={cancel}>{children}</QuestionBody>
      ) : (
        <>
          {message ? <p className="break-words text-sm text-[var(--fg-2)]">{message}</p> : null}
          {children}
        </>
      )}
    </Sheet>
  )
}

interface QuestionBodyProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  freePathLabel?: string
  answersDisabled: boolean
  confirmDisabled: boolean
  confirmLoading: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

function QuestionBody({ title, message, confirmLabel, cancelLabel, freePathLabel, answersDisabled, confirmDisabled, confirmLoading, onConfirm, onCancel, children }: Readonly<QuestionBodyProps>) {
  return (
    <div className="flex flex-col gap-6">
      {message ? <p className="break-words text-sm text-[var(--fg-2)]">{message}</p> : null}
      <div role="group" aria-label={title} data-option-group="" className="grid w-full grid-cols-2 gap-3">
        <OptionCard label={confirmLabel} disabled={confirmDisabled} loading={confirmLoading} onSelect={onConfirm} />
        <OptionCard label={cancelLabel} disabled={answersDisabled} onSelect={onCancel} />
      </div>
      {children}
      {freePathLabel ? <div className="flex justify-end"><PillButton variant="secondary" size="sm" disabled={confirmDisabled} onClick={onConfirm}>{freePathLabel}</PillButton></div> : null}
    </div>
  )
}
