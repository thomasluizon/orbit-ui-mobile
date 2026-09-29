'use client'

import { Toast } from '@/components/ui/toast'
import { useAppToastStore } from '@/stores/app-toast-store'

export function AppToastHost({ placement = 'slot' }: Readonly<{ placement?: 'slot' | 'page' }>) {
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  if (!currentToast) return null

  const toast = currentToast.toast
  const hostedToast = (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? { ...toast, onAction: triggerAction }
    : toast

  if (placement === 'slot') return <Toast key={currentToast.id} {...hostedToast} />
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-toast mx-auto w-full max-w-[440px] px-4 pb-[var(--safe-bottom)] [&>*]:pointer-events-auto" data-toast-page-host="">
      <Toast key={currentToast.id} {...hostedToast} />
    </div>
  )
}
