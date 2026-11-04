'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModalError, type AppToastItem } from '@orbit/shared/stores'
import { ActionRow } from './action-row'
import { ErrorState } from './error-state'
import { PillButton } from './pill-button'
import { IconButton } from './icon-button'
import { X } from './icons'
import { useTranslations } from 'next-intl'
import { AnimatePresence } from 'motion/react'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

export function AppToastHost({ placement = 'slot', modalId }: Readonly<{ placement?: 'slot' | 'page' | 'modal'; modalId?: string }>) {
  const [presentation, setPresentation] = useState<typeof import('@/components/ui/toast') | null>(null)
  useEffect(() => {
    let mounted = true
    void import('@/components/ui/toast').then(module => {
      if (mounted) setPresentation(module)
    }).catch((error: unknown) => {
      window.dispatchEvent(new ErrorEvent('error', { error, message: String(error), cancelable: true }))
    })
    return () => { mounted = false }
  }, [])
  const currentToast = useAppToastStore((state) => state.currentToast)
  const queue = useAppToastStore((state) => state.queue)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const dismissToast = useAppToastStore((state) => state.dismissToast)
  const toastId = currentToast?.id
  const dismiss = useCallback(() => { if (toastId !== undefined) dismissToast(toastId) }, [dismissToast, toastId])
  const activeModalId = useUIStore((state) => [...state.openOverlayIds].reverse().find((id) => id.startsWith('modal:')))
  if (placement === 'modal') {
    const error = getModalError({ currentToast, queue })
    return modalId && activeModalId === modalId && error ? <ModalErrorNotice item={error} /> : null
  }
  if (activeModalId) return null
  const toast = currentToast?.toast
  const hostedToast = toast && (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? { ...toast, onAction: triggerAction }
    : toast

  const content = presentation && currentToast && hostedToast ? <presentation.Toast key={currentToast.id} {...hostedToast} onDismiss={dismiss} /> : null
  if (placement !== 'page') return <AnimatePresence>{content}</AnimatePresence>
  return (
    <div className="pointer-events-none fixed left-[var(--safe-left)] right-[var(--safe-right)] bottom-0 z-toast mx-auto max-w-[440px] px-4 pb-[var(--safe-bottom)] [&>*]:pointer-events-auto" data-toast-page-host="">
      <AnimatePresence>{content}</AnimatePresence>
    </div>
  )
}

function ModalErrorNotice({ item }: Readonly<{ item: AppToastItem }>) {
  const t = useTranslations()
  const dismissToast = useAppToastStore(state => state.dismissToast)
  const triggerAction = useAppToastStore(state => state.triggerAction)
  return <ErrorState message={item.toast.message} action={<ActionRow>
    {item.toast.actionLabel ? <PillButton size="sm" onClick={() => triggerAction(item.id)}>{item.toast.actionLabel}</PillButton> : null}
    <IconButton label={t('common.close')} onClick={() => dismissToast(item.id)}><X size={20} aria-hidden="true" /></IconButton>
  </ActionRow>} />
}
