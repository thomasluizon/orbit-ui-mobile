'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* across components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useIsClient } from '@/hooks/use-is-client'
import { usePopoverMenu, type UsePopoverMenuOptions } from '@/hooks/use-popover-menu'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

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

  const {
    isOpen: hookIsOpen,
    open: hookOpen,
    close: hookClose,
    toggle: hookToggle,
    triggerRef,
    panelRef,
    position,
  } = usePopoverMenu({ placement, offset, margin })
  const wasOpenRef = useRef(false)

  const isOpen = isControlled ? controlledOpen : hookIsOpen

  const close = isControlled
    ? () => onOpenChange?.(false)
    : hookClose

  useEffect(() => {
    if (!isControlled) return
    if (controlledOpen) hookOpen()
    else hookClose()
  }, [isControlled, controlledOpen, hookOpen, hookClose])

  const previousHookIsOpenRef = useRef(hookIsOpen)
  useEffect(() => {
    if (previousHookIsOpenRef.current === hookIsOpen) return
    previousHookIsOpenRef.current = hookIsOpen
    if (isControlled && !hookIsOpen && controlledOpen) {
      onOpenChange?.(false)
    }
  }, [hookIsOpen, isControlled, controlledOpen, onOpenChange])

  const mounted = useIsClient()

  useEffect(() => {
    if (!isOpen) return

    const rafId = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return

      const [firstFocusable] = getFocusableElements(panel)
      ;(firstFocusable ?? panel).focus()
    })

    return () => cancelAnimationFrame(rafId)
    // react-doctor-disable-next-line exhaustive-deps -- isOpen is derived from isControlled/controlledOpen/hookIsOpen every render and already listed; the effect must key off the resolved open state, not its sources https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [panelRef, isOpen])

  useEffect(() => {
    if (!wasOpenRef.current || isOpen) {
      wasOpenRef.current = isOpen
      return
    }

    const rafId = requestAnimationFrame(() => {
      const triggerContainer = triggerRef.current
      if (!triggerContainer) return

      const triggerTarget =
        triggerContainer.querySelector<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        ) ?? triggerContainer
      triggerTarget.focus()
    })

    wasOpenRef.current = isOpen
    return () => cancelAnimationFrame(rafId)
    // react-doctor-disable-next-line exhaustive-deps -- isOpen is derived from isControlled/controlledOpen/hookIsOpen every render and already listed; the effect must key off the resolved open state, not its sources https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [triggerRef, isOpen])

  const resolvedPanel =
    typeof children === 'function' ? children(close) : children

  const handleTriggerClickCapture = isControlled ? undefined : hookToggle

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const panel = panelRef.current
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
      {/* react-doctor-disable-next-line click-events-have-key-events -- capture-phase wrapper for the real trigger button nested inside; keyboard activation of that button dispatches a click that this onClickCapture catches, so keyboard users are fully served https://github.com/thomasluizon/orbit-ui-mobile/issues/243 */}
      <div
        ref={triggerRef}
        onClickCapture={handleTriggerClickCapture}
        style={{ display: 'inline-flex' }}
      >
        {trigger}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="false"
                className={[
                  'fixed',
                  'p-1',
                  'z-dropdown',
                  className,
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  top: `${position.top}px`,
                  left: `${position.left}px`,
                  background: 'var(--bg-sheet)',
                  borderRadius: 16,
                  boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline)',
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
          // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- unreachable during SSR: this createPortal only evaluates inside `mounted && ...` (useIsClient false on the server and first hydration render) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
          document.body,
        )}
    </>
  )
}
