'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface HabitCardMenuItem {
  key: string
  icon: LucideIcon
  label: string
  onClick: () => void
  variant?: 'danger' | 'warning'
  hidden?: boolean
}

interface HabitCardMenuProps {
  items: HabitCardMenuItem[]
  isSelectMode: boolean
}

const MENU_WIDTH_PX = 192
const MENU_MARGIN_PX = 8
const MENU_ESTIMATED_HEIGHT_PX = 240

/**
 * Three-dot kebab + portalled menu panel. Extracted so the card body stays
 * focused on layout. Behavior preserved 1:1 from the previous implementation:
 * keyboard navigation, viewport flip, scroll-close, bottom-nav awareness.
 */
export function HabitCardMenu({ items, isSelectMode }: HabitCardMenuProps) {
  const t = useTranslations()
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [opensUp, setOpensUp] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  const toggle = useCallback(() => {
    if (open) {
      close()
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const bottomNav = document.querySelector<HTMLElement>('[data-bottom-nav]')
      const effectiveBottom = bottomNav?.getBoundingClientRect().top ?? globalThis.innerHeight
      const flip = rect.bottom + MENU_ESTIMATED_HEIGHT_PX + MENU_MARGIN_PX > effectiveBottom
      setOpensUp(flip)
      const preferredLeft = rect.right - MENU_WIDTH_PX
      const maxLeft = globalThis.innerWidth - MENU_WIDTH_PX - MENU_MARGIN_PX
      const left = Math.min(
        Math.max(preferredLeft, MENU_MARGIN_PX),
        Math.max(MENU_MARGIN_PX, maxLeft),
      )
      const top = flip ? rect.top - MENU_MARGIN_PX : rect.bottom + MENU_MARGIN_PX
      setPosition({ top, left })
    }
    setOpen(true)
  }, [open, close])

  useEffect(() => {
    if (isSelectMode) close()
  }, [isSelectMode, close])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      close()
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    function handleScroll() {
      close()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    document.addEventListener('scroll', handleScroll, true)
    globalThis.addEventListener('resize', close)
    globalThis.addEventListener('orientationchange', close)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('scroll', handleScroll, true)
      globalThis.removeEventListener('resize', close)
      globalThis.removeEventListener('orientationchange', close)
    }
  }, [open, close])

  if (isSelectMode) return null

  const visibleItems = items.filter((item) => !item.hidden)

  return (
    <>
      <div ref={triggerRef} className="relative shrink-0">
        <button
          type="button"
          data-no-drag
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          aria-label={t('habits.actions.more')}
          aria-haspopup="menu"
          aria-expanded={open}
          className="text-text-muted/60 hover:text-text-primary transition-all duration-150 rounded-full hover:bg-surface-elevated/70 p-2"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      {open
        ? createPortal(
            <MenuPanel
              panelRef={panelRef}
              items={visibleItems}
              position={position}
              opensUp={opensUp}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </>
  )
}

interface MenuPanelProps {
  panelRef: React.RefObject<HTMLDivElement | null>
  items: HabitCardMenuItem[]
  position: { top: number; left: number }
  opensUp: boolean
  onClose: () => void
}

function MenuPanel({ panelRef, items, position, opensUp, onClose }: Readonly<MenuPanelProps>) {
  const dangerIndex = items.findIndex((item) => item.variant === 'danger')
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      panelRef.current = el
      if (el) {
        requestAnimationFrame(() => {
          el.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
        })
      }
    },
    [panelRef],
  )
  return (
    <div
      ref={setRef}
      role="menu"
      tabIndex={-1}
      className="habit-actions-menu fixed z-[70] min-w-[12rem] rounded-2xl p-1.5"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: opensUp ? 'translateY(-100%)' : 'none',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const els = panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
        if (!els?.length) return
        const idx = Array.from(els).indexOf(document.activeElement as HTMLElement)
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          els[idx < els.length - 1 ? idx + 1 : 0]?.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          els[idx > 0 ? idx - 1 : els.length - 1]?.focus()
        } else if (e.key === 'Home') {
          e.preventDefault()
          els[0]?.focus()
        } else if (e.key === 'End') {
          e.preventDefault()
          els[els.length - 1]?.focus()
        }
      }}
    >
      {items.map((item, idx) => {
        const isDanger = item.variant === 'danger'
        const isWarning = item.variant === 'warning'
        const showDivider = isDanger && dangerIndex > 0 && idx === dangerIndex
        const Icon = item.icon
        let cls = 'text-text-primary hover:bg-surface-elevated/70'
        if (isDanger) cls = 'text-red-400 hover:bg-red-500/10'
        else if (isWarning) cls = 'text-amber-400 hover:bg-amber-400/10'
        return (
          <div key={item.key}>
            {showDivider ? <div className="my-1 mx-2 h-px bg-surface-elevated/60" /> : null}
            <button
              type="button"
              role="menuitem"
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors duration-150 ${cls}`}
              onClick={(e) => {
                e.stopPropagation()
                item.onClick()
                onClose()
              }}
            >
              <Icon className={`size-4 ${isDanger || isWarning ? '' : 'text-text-muted'}`} />
              {item.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
