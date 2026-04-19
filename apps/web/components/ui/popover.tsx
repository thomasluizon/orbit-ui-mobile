'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { usePopoverMenu, type UsePopoverMenuOptions } from '@/hooks/use-popover-menu'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

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

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)
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
  const prefersReducedMotion = useReducedMotion()
  const motionPreset = resolveMotionPreset('menu', Boolean(prefersReducedMotion))

  const hook = usePopoverMenu({ placement, offset, margin })
  const wasOpenRef = useRef(false)

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

  // Propagate hook dismiss events (outside click, Escape, scroll) back to
  // the controlled parent. Without this, dismiss handlers only update the
  // hook's internal state and the panel stays open.
  useEffect(() => {
    if (!isControlled) return
    if (!hook.isOpen && controlledOpen) {
      onOpenChange?.(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hook.isOpen])

  // For SSR safety, delay portal rendering until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const rafId = requestAnimationFrame(() => {
      const panel = hook.panelRef.current
      if (!panel) return

      const [firstFocusable] = getFocusableElements(panel)
      ;(firstFocusable ?? panel).focus()
    })

    return () => cancelAnimationFrame(rafId)
  }, [hook.panelRef, isOpen])

  useEffect(() => {
    if (!wasOpenRef.current || isOpen) {
      wasOpenRef.current = isOpen
      return
    }

    const rafId = requestAnimationFrame(() => {
      const triggerContainer = hook.triggerRef.current
      if (!triggerContainer) return

      const triggerTarget =
        triggerContainer.querySelector<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        ) ?? triggerContainer
      triggerTarget.focus()
    })

    wasOpenRef.current = isOpen
    return () => cancelAnimationFrame(rafId)
  }, [hook.triggerRef, isOpen])

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

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const panel = hook.panelRef.current
    if (!panel) return

    const focusableElements = getFocusableElements(panel)
    if (focusableElements.length === 0) return

    event.preventDefault()

    if (event.key === 'Home') {
      focusableElements[0]?.focus()
      return
    }

    if (event.key === 'End') {
      focusableElements.at(-1)?.focus()
      return
    }

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1
    const step = event.key === 'ArrowDown' ? 1 : -1
    const fallbackIndex = step > 0 ? 0 : focusableElements.length - 1
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : (currentIndex + step + focusableElements.length) % focusableElements.length

    focusableElements[nextIndex]?.focus()
  }

  return (
    <>
      {/* Trigger wrapper -- ref forwarded so hook can read its bounding rect.
          display:inline-flex preserves layout flow while giving a measurable rect
          (display:contents returns a zero rect from getBoundingClientRect). */}
      <div
        ref={hook.triggerRef as unknown as React.RefObject<HTMLDivElement>}
        style={{ display: 'inline-flex' }}
      >
        {trigger}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                ref={hook.panelRef}
                role="dialog"
                aria-modal="false"
                className={[
                  'habit-actions-menu',
                  'fixed',
                  'rounded-[var(--radius-xl)]',
                  'z-50',
                  className,
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  top: `${hook.position.top}px`,
                  left: `${hook.position.left}px`,
                }}
                tabIndex={-1}
                onKeyDown={handlePanelKeyDown}
                initial={{
                  opacity: 0,
                  y: -Math.round(motionPreset.shift * 0.4),
                  scale: motionPreset.scaleFrom,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: motionPreset.scaleTo,
                  transition: {
                    duration: motionPreset.enterDuration / 1000,
                    ease: motionPreset.enterEasing,
                  },
                }}
                exit={{
                  opacity: 0,
                  y: -Math.round(motionPreset.shift * 0.25),
                  scale: 0.985,
                  transition: {
                    duration: motionPreset.exitDuration / 1000,
                    ease: motionPreset.exitEasing,
                  },
                }}
              >
                {resolvedPanel}
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
