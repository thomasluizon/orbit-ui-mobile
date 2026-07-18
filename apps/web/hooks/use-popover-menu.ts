'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useScroll, useMotionValueEvent } from 'motion/react'

export interface PopoverPosition {
  top: number
  left: number
}

export type PopoverPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'bottom-center'
  | 'top-start'
  | 'top-end'

export interface UsePopoverMenuOptions {
  /** Preferred placement relative to the trigger. Defaults to 'bottom-start'. */
  placement?: PopoverPlacement
  /** Gap between trigger and panel in px. Defaults to 8. */
  offset?: number
  /** Minimum distance between panel edge and viewport edge in px. Defaults to 12. */
  margin?: number
}

export interface UsePopoverMenuReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  triggerRef: React.RefObject<HTMLDivElement | null>
  panelRef: React.RefObject<HTMLDivElement | null>
  position: PopoverPosition
}

export function usePopoverMenu(options: UsePopoverMenuOptions = {}): UsePopoverMenuReturn {
  const { placement = 'bottom-start', offset = 8, margin = 12 } = options

  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0 })

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const vw = globalThis.innerWidth
    const vh = globalThis.innerHeight

    let top = 0
    let left = 0

    if (placement === 'top-start' || placement === 'top-end') {
      top = rect.top - offset
    } else {
      top = rect.bottom + offset
    }

    if (placement === 'bottom-start' || placement === 'top-start') {
      left = rect.left
    } else if (placement === 'bottom-end' || placement === 'top-end') {
      left = rect.right
    } else {
      left = rect.left + rect.width / 2
    }

    setPosition({ top, left })

    requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return

      const panelRect = panel.getBoundingClientRect()
      const panelW = panelRect.width
      const panelH = panelRect.height

      let clampedLeft = left
      let clampedTop = top

      if (placement === 'bottom-end' || placement === 'top-end') {
        clampedLeft = rect.right - panelW
      } else if (placement === 'bottom-center') {
        clampedLeft = rect.left + rect.width / 2 - panelW / 2
      }

      clampedLeft = Math.max(
        margin,
        Math.min(clampedLeft, vw - panelW - margin),
      )

      if (placement !== 'top-start' && placement !== 'top-end') {
        clampedTop = Math.max(
          margin,
          Math.min(clampedTop, vh - panelH - margin),
        )
      }

      setPosition({ top: clampedTop, left: clampedLeft })
    })
  }, [placement, offset, margin])

  const open = useCallback(() => {
    computePosition()
    setIsOpen(true)
  }, [computePosition])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      computePosition()
      setIsOpen(true)
    }
  }, [isOpen, computePosition])

  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', () => {
    if (isOpen) setIsOpen(false)
  })

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setIsOpen(false)
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
    }

    function handleResize() {
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeydown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  return { isOpen, open, close, toggle, triggerRef, panelRef, position }
}
