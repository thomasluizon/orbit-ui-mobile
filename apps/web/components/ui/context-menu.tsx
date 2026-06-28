'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useIsClient } from '@/hooks/use-is-client'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

export interface ContextMenuItem {
  key: string
  label: string
  onSelect: () => void
  danger?: boolean
}

export interface UseContextMenuReturn {
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
  contextMenu: ReactNode
}

interface MenuOrigin {
  top: number
  left: number
}

const VIEWPORT_MARGIN = 8
const MENU_MIN_WIDTH = 200

/** Desktop right-click context menu. Spread `onContextMenu` onto the target element
 *  and render the returned `contextMenu` beside it. The menu opens at the cursor from
 *  `items`, closes on Escape / outside-click / scroll, and no-ops when `items` is empty
 *  (so touch contexts with no actions fall through to native behavior). */
export function useContextMenu(items: ReadonlyArray<ContextMenuItem>): UseContextMenuReturn {
  const [origin, setOrigin] = useState<MenuOrigin | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const mounted = useIsClient()
  const prefersReducedMotion = useReducedMotion()
  const preset = resolveMotionPreset('menu', Boolean(prefersReducedMotion))

  const isOpen = origin !== null

  const close = useCallback(() => setOrigin(null), [])

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (items.length === 0) return
      event.preventDefault()
      setOrigin({ top: event.clientY, left: event.clientX })
    },
    [items.length],
  )

  useEffect(() => {
    if (!isOpen) return
    const rafId = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      panel.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
      const { width, height } = panel.getBoundingClientRect()
      setOrigin((prev) => {
        if (!prev) return prev
        const left = Math.max(
          VIEWPORT_MARGIN,
          Math.min(prev.left, globalThis.innerWidth - width - VIEWPORT_MARGIN),
        )
        const top = Math.max(
          VIEWPORT_MARGIN,
          Math.min(prev.top, globalThis.innerHeight - height - VIEWPORT_MARGIN),
        )
        if (left === prev.left && top === prev.top) return prev
        return { top, left }
      })
    })
    return () => cancelAnimationFrame(rafId)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      close()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    function handleViewportChange() {
      close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleViewportChange, { capture: true })
    window.addEventListener('resize', handleViewportChange)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleViewportChange, { capture: true })
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [isOpen, close])

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const panel = panelRef.current
    if (!panel) return
    const menuItems = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    if (menuItems.length === 0) return
    event.preventDefault()
    if (event.key === 'Home') {
      menuItems[0]?.focus()
      return
    }
    if (event.key === 'End') {
      menuItems.at(-1)?.focus()
      return
    }
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const currentIndex = active ? menuItems.indexOf(active) : -1
    const step = event.key === 'ArrowDown' ? 1 : -1
    const fallback = step > 0 ? 0 : menuItems.length - 1
    const nextIndex =
      currentIndex === -1
        ? fallback
        : (currentIndex + step + menuItems.length) % menuItems.length
    menuItems[nextIndex]?.focus()
  }

  const contextMenu =
    mounted &&
    createPortal(
      <AnimatePresence>
        {origin ? (
          <motion.div
            ref={panelRef}
            role="menu"
            className="fixed z-[70] p-1"
            style={{
              top: origin.top,
              left: origin.left,
              minWidth: MENU_MIN_WIDTH,
              background: 'var(--bg-sheet)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline)',
              transformOrigin: 'top left',
            }}
            tabIndex={-1}
            onKeyDown={handlePanelKeyDown}
            initial={{ opacity: 0, scale: preset.scaleFrom }}
            animate={{
              opacity: 1,
              scale: preset.scaleTo,
              transition: {
                duration: preset.enterDuration / 1000,
                ease: preset.enterEasing,
              },
            }}
            exit={{
              opacity: 0,
              scale: 0.985,
              transition: {
                duration: preset.exitDuration / 1000,
                ease: preset.exitEasing,
              },
            }}
          >
            {items.map((item) => (
              <ContextMenuRow
                key={item.key}
                item={item}
                onRun={() => {
                  item.onSelect()
                  close()
                }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body,
    )

  return { onContextMenu, contextMenu }
}

interface ContextMenuRowProps {
  item: ContextMenuItem
  onRun: () => void
}

function ContextMenuRow({ item, onRun }: Readonly<ContextMenuRowProps>) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation()
        onRun()
      }}
      className="appearance-none border-0 bg-transparent w-full flex items-center text-left transition-colors hover:bg-[var(--bg-sunk)] focus-visible:bg-[var(--bg-sunk)] focus:outline-none"
      style={{
        gap: 10,
        minHeight: 44,
        padding: '0 14px',
        borderRadius: 10,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 500,
        color: item.danger ? 'var(--status-bad-text)' : 'var(--fg-1)',
        cursor: 'pointer',
      }}
    >
      {item.label}
    </button>
  )
}
