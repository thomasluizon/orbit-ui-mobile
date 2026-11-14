'use client'

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
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
  /**
   * `overlay` covers the view, keeps the background inert and opens with the `route-push` preset: a flow started from
   * a row or an action. `route` fills a route that is already its own screen, so the shell and the sidebar stay.
   */
  presentation?: 'overlay' | 'route'
  children: ReactNode
}

/** The one host of a one-question flow on web. Every flow mounts inside it. */
export function FlowScreen({ presentation = 'overlay', ...props }: Readonly<FlowScreenProps>) {
  if (presentation === 'route') return <FlowScreenRoute {...props} />
  return <FlowScreenOverlay {...props} />
}

/** Escape asks to leave, as it does in the overlay. A sheet above the flow keeps its own Escape. */
function FlowScreenRoute({ label, onDismiss, children }: Readonly<Omit<FlowScreenProps, 'presentation'>>) {
  const regionRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      const target = event.target
      const inFlow = target === document.body || (target instanceof Node && regionRef.current?.contains(target) === true)
      if (event.key === 'Escape' && inFlow) onDismiss()
    }
    document.addEventListener('keydown', dismissOnEscape)
    return () => document.removeEventListener('keydown', dismissOnEscape)
  }, [onDismiss])
  return <div ref={regionRef} data-flow-screen="" data-presentation="route" aria-label={label} role="region" className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
}

function FlowScreenOverlay({ label, onDismiss, children }: Readonly<Omit<FlowScreenProps, 'presentation'>>) {
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
