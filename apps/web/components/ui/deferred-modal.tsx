'use client'

import { Suspense, useId, useLayoutEffect, type ReactNode } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function DeferredModal({ open, children }: Readonly<{ open: boolean; children: ReactNode }>) {
  const modalId = `modal:deferred-${useId()}`
  useLayoutEffect(() => {
    if (!open) return
    const { registerOpenOverlay, unregisterOpenOverlay } = useUIStore.getState()
    registerOpenOverlay(modalId)
    return () => unregisterOpenOverlay(modalId)
  }, [modalId, open])
  return <Suspense fallback={null}>{children}</Suspense>
}
