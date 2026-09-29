'use client'

import { Toast } from '@/components/ui/toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

export function AppToastHost({ placement = 'slot', sheetId }: Readonly<{ placement?: 'slot' | 'page' | 'sheet'; sheetId?: string }>) {
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const topOverlayId = useUIStore((state) => state.openOverlayIds.at(-1))
  const activeSheetId = topOverlayId?.startsWith('sheet:') ? topOverlayId : null
  if (placement === 'sheet') {
    if (!sheetId || !activeSheetId || activeSheetId !== sheetId) return null
  } else if (activeSheetId) return null
  if (!currentToast) return null

  const toast = currentToast.toast
  const hostedToast = (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? { ...toast, onAction: triggerAction }
    : toast

  if (placement !== 'page') return <Toast key={currentToast.id} {...hostedToast} outlined={placement === 'sheet'} />
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-toast mx-auto w-full max-w-[440px] px-4 pb-[var(--safe-bottom)] [&>*]:pointer-events-auto" data-toast-page-host="">
      <Toast key={currentToast.id} {...hostedToast} />
    </div>
  )
}
