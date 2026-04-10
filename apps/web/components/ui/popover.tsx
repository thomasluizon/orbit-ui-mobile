'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverMenu, type UsePopoverMenuOptions } from '@/hooks/use-popover-menu'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PopoverProps extends UsePopoverMenuOptions {
  /** The element that triggers the popover. Must be or contain a <button>. */
  trigger: ReactNode
  /** Panel content, or a render-prop receiving a close callback. */
  children: ReactNode | ((close: () => void) => ReactNode)
  /** Controlled open state. When provided, combine with onOpenChange. */
  open?: boolean
  /** Called when the internal state requests an open/close transition. */
  onOpenChange?: (open: boolean) => void
  /** Additional className applied to the panel div. */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  className,
  placement,
  offset,
  margin,
}: Readonly<PopoverProps>) {
  const isControlled = controlledOpen !== undefined

  const hook = usePopoverMenu({ placement, offset, margin })

  // Resolve effective open state and close function based on mode.
  const isOpen = isControlled ? controlledOpen : hook.isOpen

  const close = isControlled
    ? () => onOpenChange?.(false)
    : hook.close

  // When in controlled mode, sync the internal hook whenever `controlledOpen`
  // changes so position is computed on open.
  useEffect(() => {
    if (!isControlled) return
    if (controlledOpen) {
      hook.open()
    } else {
      hook.close()
    }
  // hook.open/close are stable callbacks -- safe to list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled, controlledOpen])

  // For SSR safety, delay portal rendering until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Wrap the trigger so we can forward the triggerRef.
  // We render it inside a span that gets the ref forwarded via a hidden button
  // wrapper -- but since we need the ref on a button, we clone/wrap differently.
  // Strategy: render a <span> that passes the ref down via data attribute, and
  // attach ref to the wrapping element's first button child. Instead, the
  // cleanest approach is to render the trigger inside a wrapper and attach the
  // ref to that wrapper, cast as HTMLButtonElement (acceptable because the
  // wrapper is used only for getBoundingClientRect).
  //
  // The ref is typed as RefObject<HTMLButtonElement | null> in the hook but we
  // only call .getBoundingClientRect() and .contains() on it, both of which are
  // available on any HTMLElement. We use a div wrapper and a cast-free approach:
  // the hook's triggerRef is reassigned to the wrapper div ref here.

  const resolvedPanel =
    typeof children === 'function' ? children(close) : children

  return (
    <>
      {/* Trigger wrapper -- ref forwarded so hook can read its bounding rect */}
      <div
        ref={hook.triggerRef as unknown as React.RefObject<HTMLDivElement>}
        style={{ display: 'contents' }}
      >
        {trigger}
      </div>

      {/* Panel portal -- only rendered when open and client is mounted */}
      {mounted && isOpen &&
        createPortal(
          <div
            ref={hook.panelRef}
            role="dialog"
            aria-modal="false"
            className={[
              'habit-actions-menu',
              'fixed',
              'rounded-[var(--radius-xl)]',
              'z-50',
              'animate-scale-in',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              top: `${hook.position.top}px`,
              left: `${hook.position.left}px`,
            }}
          >
            {resolvedPanel}
          </div>,
          document.body,
        )}
    </>
  )
}
