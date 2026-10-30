'use client'

import { useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence } from 'motion/react'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

const Toast = dynamic(() => import('@/components/ui/toast').then((module) => module.Toast), { loading: () => null })

export function AppToastHost({ placement = 'slot', modalId }: Readonly<{ placement?: 'slot' | 'page' | 'modal'; modalId?: string }>) {
  useEffect(() => {
    void import('@/components/ui/toast').catch((error: unknown) => {
      window.dispatchEvent(new ErrorEvent('error', { error, message: String(error), cancelable: true }))
    })
  }, [])
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const dismissToast = useAppToastStore((state) => state.dismissToast)
  const toastId = currentToast?.id
  const dismiss = useCallback(() => { if (toastId !== undefined) dismissToast(toastId) }, [dismissToast, toastId])
  const activeModalId = useUIStore((state) => [...state.openOverlayIds].reverse().find((id) => id.startsWith('modal:')))
  if (placement === 'modal') {
    if (!modalId || activeModalId !== modalId) return null
  } else if (activeModalId) return null
  const toast = currentToast?.toast
  const hostedToast = toast && (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? { ...toast, onAction: triggerAction }
    : toast

  const content = currentToast && hostedToast ? <Toast key={currentToast.id} {...hostedToast} onDismiss={dismiss} outlined={placement === 'modal'} /> : null
  if (placement !== 'page') return <AnimatePresence>{content}</AnimatePresence>
  return (
    <div className="pointer-events-none fixed left-[var(--safe-left)] right-[var(--safe-right)] bottom-0 z-toast mx-auto max-w-[440px] px-4 pb-[var(--safe-bottom)] [&>*]:pointer-events-auto" data-toast-page-host="">
      <AnimatePresence>{content}</AnimatePresence>
    </div>
  )
}
