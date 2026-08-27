'use client'

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { MenuItem, MenuProps } from '@orbit/shared/contracts/overlay'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Sheet } from '@/components/ui/sheet'

const DEFAULT_WIDE_FROM = 900
const EMPTY_MENU_ITEMS: readonly MenuItem[] = []
const subscribeToPortalTarget = () => () => {}
const getPortalTarget = () => document.body
const getServerPortalTarget = () => null

function orderedItems(items: readonly MenuItem[]): readonly MenuItem[] {
  return [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
}

function useWidePresentation(wideFrom: number): boolean {
  const [wide, setWide] = useState(false)

  useEffect(() => {
    const query = globalThis.matchMedia(`(min-width: ${wideFrom}px)`)
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [wideFrom])

  return wide
}

interface MenuItemsProps {
  items: readonly MenuItem[]
  onSelect?: (id: string) => void
  onClose?: () => void
}

function MenuItems({ items, onSelect, onClose }: Readonly<MenuItemsProps>) {
  return (
    <div className="orbit-menu-items">
      {orderedItems(items).map((item) => {
        const disabled = Boolean(item.disabled && !item.badge)
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={disabled}
            data-destructive={item.destructive || undefined}
            className="orbit-menu-item"
            onClick={() => {
              onSelect?.(item.id)
              onClose?.()
            }}
          >
            {item.icon ? <Icon name={item.icon} size={20} /> : null}
            <span className="orbit-menu-label">{item.label}</span>
            {item.badge ? <Badge>{item.badge}</Badge> : null}
          </button>
        )
      })}
    </div>
  )
}

interface Position {
  left: number
  top: number
  origin: string
}

function anchorElement(anchorRef: RefObject<unknown> | undefined): HTMLElement | null {
  return anchorRef?.current instanceof HTMLElement ? anchorRef.current : null
}

/** One overflow menu. Width, never platform or caller identity, chooses its presentation. */
export function Menu({
  open = false,
  items = EMPTY_MENU_ITEMS,
  onSelect,
  onClose,
  title,
  presentation = 'auto',
  anchorRef,
  align = 'end',
  wideFrom = DEFAULT_WIDE_FROM,
}: Readonly<MenuProps>) {
  const wide = useWidePresentation(wideFrom)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const portalTarget = useSyncExternalStore(
    subscribeToPortalTarget,
    getPortalTarget,
    getServerPortalTarget,
  )
  const resolvedPresentation = presentation === 'auto' ? (wide ? 'anchored' : 'sheet') : presentation

  const closeMenu = useEffectEvent(() => onClose?.())

  useLayoutEffect(() => {
    if (!open || resolvedPresentation !== 'anchored') return
    const anchor = anchorElement(anchorRef)
    const panel = panelRef.current
    if (!anchor || !panel) return
    const anchorRect = anchor.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const margin = 8
    const preferredLeft = align === 'start' ? anchorRect.left : anchorRect.right - panelRect.width
    const left = Math.max(margin, Math.min(preferredLeft, globalThis.innerWidth - panelRect.width - margin))
    const opensUp = anchorRect.bottom + panelRect.height + margin > globalThis.innerHeight
    const top = opensUp
      ? Math.max(margin, anchorRect.top - panelRect.height - margin)
      : anchorRect.bottom + margin
    setPosition({ left, top, origin: `${align} ${opensUp ? 'bottom' : 'top'}` })
  }, [align, anchorRef, open, resolvedPresentation])

  useEffect(() => {
    if (!open || resolvedPresentation !== 'anchored') return
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()

    function dismiss(event: Event) {
      const target = event.target
      if (target instanceof Node && panel?.contains(target)) return
      closeMenu()
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', onKeyDown)
      anchorElement(anchorRef)?.focus()
    }
  }, [anchorRef, open, resolvedPresentation])

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    )
    if (buttons.length === 0) return
    event.preventDefault()
    const activeIndex = buttons.findIndex((button) => button === document.activeElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[nextIndex]?.focus()
  }

  if (!open || items.length === 0) return null

  if (resolvedPresentation === 'sheet') {
    return (
      <Sheet open title={title} onClose={onClose}>
        <div role="menu" aria-label={title}>
          <MenuItems items={items} onSelect={onSelect} onClose={onClose} />
        </div>
      </Sheet>
    )
  }

  if (!portalTarget) return null

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={title}
      className="orbit-menu-panel"
      data-positioned={position ? '' : undefined}
      style={position ? { left: position.left, top: position.top, transformOrigin: position.origin } : undefined}
      onKeyDown={handleMenuKeyDown}
    >
      <MenuItems items={items} onSelect={onSelect} onClose={onClose} />
    </div>,
    portalTarget,
  )
}
