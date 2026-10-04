'use client'

import { Toast } from '@/components/ui/toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

export function AppToastHost({ placement = 'slot', modalId }: Readonly<{ placement?: 'slot' | 'page' | 'modal'; modalId?: string }>) {
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const activeModalId = useUIStore((state) => [...state.openOverlayIds].reverse().find((id) => id.startsWith('modal:')))
  if (placement === 'modal') {
    if (!modalId || activeModalId !== modalId) return null
  } else if (activeModalId) return null
  if (!currentToast) return null

  const toast = currentToast.toast
  const hostedToast = (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? { ...toast, onAction: triggerAction }
    : toast

  if (placement !== 'page') return <Toast key={currentToast.id} {...hostedToast} outlined={placement === 'modal'} />
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-toast mx-auto w-full max-w-[440px] pl-[max(16px,var(--safe-left))] pr-[max(16px,var(--safe-right))] pb-[var(--safe-bottom)] [&>*]:pointer-events-auto" data-toast-page-host="">
      <Toast key={currentToast.id} {...hostedToast} />
    </div>
  )
}
