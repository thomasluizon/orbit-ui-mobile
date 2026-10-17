'use client'

import { useCallback } from 'react'
import { Toast } from '@/components/ui/toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

export function AppToastHost({ placement = 'slot', modalId }: Readonly<{ placement?: 'slot' | 'page' | 'modal'; modalId?: string }>) {
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const dismissToast = useAppToastStore((state) => state.dismissToast)
  const toastId = currentToast?.id
  const dismiss = useCallback(() => { if (toastId !== undefined) dismissToast(toastId) }, [dismissToast, toastId])
  const activeModalId = useUIStore((state) => [...state.openOverlayIds].reverse().find((id) => id.startsWith('modal:')))
  if (placement === 'modal') {
    if (!modalId || activeModalId !== modalId) return null
  } else if (activeModalId) return null
  if (!currentToast) return null

  const toast = currentToast.toast
  const hostedToast = (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? { ...toast, onAction: triggerAction }
    : toast

  if (placement !== 'page') return <Toast key={currentToast.id} {...hostedToast} onDismiss={dismiss} outlined={placement === 'modal'} />
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-toast mx-auto w-full max-w-[440px] pl-[max(var(--orbit-space-16),var(--safe-left))] pr-[max(var(--orbit-space-16),var(--safe-right))] pb-[var(--safe-bottom)] [&>*]:pointer-events-auto" data-toast-page-host="">
      <Toast key={currentToast.id} {...hostedToast} onDismiss={dismiss} />
    </div>
  )
}
