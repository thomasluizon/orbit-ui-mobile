'use client'

import { useTranslations } from 'next-intl'
import { AppOverlay } from './app-overlay'

type Variant = 'danger' | 'warning' | 'success'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  /** 'danger' is treated as destructive — italicized action label, no semantic fill. */
  variant?: Variant
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'danger',
}: Readonly<ConfirmDialogProps>) {
  const t = useTranslations()
  const destructive = variant === 'danger'

  function handleConfirm() {
    onConfirm()
    onOpenChange(false)
  }

  function handleCancel() {
    onCancel?.()
    onOpenChange(false)
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex justify-end items-center" style={{ gap: 16 }}>
          <button
            type="button"
            onClick={handleCancel}
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--fg-3)',
              padding: 6,
            }}
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--fg-1)',
              fontStyle: destructive ? 'italic' : 'normal',
              padding: 6,
            }}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      }
    >
      <p
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--fg-2)',
          paddingBottom: 16,
        }}
      >
        {description}
      </p>
    </AppOverlay>
  )
}
