'use client'

import { useTranslations } from 'next-intl'
import { AppOverlay } from './app-overlay'

type Variant = 'danger' | 'warning' | 'success' | 'info'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  /** 'danger' renders the confirm action as a status-bad fill pill (dlg-delete
   *  artboard). 'info' renders a single close action and hides the cancel button. */
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
  const infoOnly = variant === 'info'

  function handleConfirm() {
    onConfirm?.()
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
        <div className="flex items-center" style={{ gap: 10 }}>
          {!infoOnly && (
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 appearance-none border-0 cursor-pointer rounded-full transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-85 active:opacity-75"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--fg-1)',
                background: 'var(--bg-field)',
                padding: '13px 0',
                minHeight: 44,
              }}
            >
              {cancelLabel || t('common.cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 appearance-none border-0 cursor-pointer rounded-full transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-90 active:opacity-80"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg-on-primary)',
              background: destructive ? 'var(--status-bad)' : 'var(--primary)',
              padding: '13px 0',
              minHeight: 44,
            }}
          >
            {confirmLabel || (infoOnly ? t('common.close') : t('common.confirm'))}
          </button>
        </div>
      }
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
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
