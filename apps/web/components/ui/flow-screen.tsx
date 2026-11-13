'use client'

import { useId, useLayoutEffect, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { motion } from 'motion/react'
import { motionPresets } from '@orbit/shared/theme'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useUIStore } from '@/stores/ui-store'

interface FlowScreenProps {
  /** The accessible name of the screen: the action the flow does, such as "Start over". */
  label: string
  /** Escape. The flow decides what a dismissal does: a step back, the discard sheet, or a close. */
  onDismiss: () => void
  children: ReactNode
}

/** The screen that hosts a one-question flow started from a settings row. It covers the view, keeps the background inert and opens with the `route-push` preset. */
export function FlowScreen({ label, onDismiss, children }: Readonly<FlowScreenProps>) {
  const overlayId = `flow-screen:${useId()}`
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const preset = motionPresets['route-push']
  const timing = reducedMotion ? preset.reducedMotion : preset
  useLayoutEffect(() => {
    useUIStore.getState().registerOpenOverlay(overlayId)
    return () => useUIStore.getState().unregisterOpenOverlay(overlayId)
  }, [overlayId])
  return (
    <OrbitOverlayLayer>
      <Dialog.Root open modal onOpenChange={(open: boolean) => { if (!open) onDismiss() }}>
        <Dialog.Portal>
          <Dialog.Popup aria-label={label} data-flow-screen="" className="fixed inset-0 z-modal flex flex-col bg-[var(--bg)]">
            <motion.div
              data-flow-screen-motion=""
              data-enter-duration={timing.enterDuration}
              initial={{ opacity: 0, x: timing.shift }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: timing.enterDuration / 1000, ease: [...timing.enterEasing] as [number, number, number, number] }}
              className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              {children}
            </motion.div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </OrbitOverlayLayer>
  )
}
