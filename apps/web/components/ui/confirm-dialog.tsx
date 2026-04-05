'use client'

import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
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
  variant?: Variant
}

const variantConfig: Record<
  Variant,
  {
    icon: typeof AlertTriangle
    bg: string
    text: string
    btn: string
  }
> = {
  danger: {
    icon: AlertTriangle,
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    btn: 'bg-red-500 hover:bg-red-600',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    btn: 'bg-amber-500 hover:bg-amber-600',
  },
  success: {
    icon: CheckCircle2,
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    btn: 'bg-green-500 hover:bg-green-600',
  },
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
  const config = variantConfig[variant]
  const Icon = config.icon

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
      titleContent={
        <div className="flex items-center gap-3">
          <div
            className={`size-10 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}
          >
            <Icon className={`size-5 ${config.text}`} />
          </div>
          <span>{title}</span>
        </div>
      }
      footer={
        <div className="flex gap-3">
          <button
            className="flex-1 py-3 rounded-xl border border-border text-text-secondary font-medium text-sm hover:bg-surface transition-colors duration-[var(--duration-fast)]"
            onClick={handleCancel}
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] shadow-[var(--shadow-sm)] ${config.btn}`}
            onClick={handleConfirm}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      }
    >
      <p className="text-text-secondary text-sm">{description}</p>
    </AppOverlay>
  )
}
