'use client'

import { useEffect, useLayoutEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ASTRA_BUTTON_SIZE, ASTRA_BUTTON_GAP, ASTRA_BUTTON_CLEARANCE, ASTRA_DRAG_THRESHOLD, ASTRA_POSITION_KEY, clampAstraButton, moveAstraButton, parseAstraButtonPosition, snapAstraButton, type AstraButtonArea, type AstraButtonObstacle, type AstraButtonPoint, type AstraMoveDirection } from '@orbit/shared/utils'
import { Fab } from '@/components/ui/fab'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useUIStore } from '@/stores/ui-store'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ListRow } from '@/components/ui/list-row'

function measurePlacement(host: HTMLDivElement) {
  const bounds = host.getBoundingClientRect()
  const obstacles = [...host.parentElement!.querySelectorAll<HTMLElement>('[data-shell-fab], [data-shell-scroll-to-top]>div')].flatMap(element => {
    const rect = element.getBoundingClientRect()
    return rect.width && rect.height ? [{ x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }] : []
  })
  return { area: { width: bounds.width, height: bounds.height }, obstacles }
}

function observePlacement(host: HTMLDivElement, update: () => void) {
  const observer = new ResizeObserver(update)
  const observeControls = () => {
    observer.disconnect()
    observer.observe(host)
    for (const element of host.parentElement!.querySelectorAll('[data-shell-fab], [data-shell-scroll-to-top]')) observer.observe(element)
    update()
  }
  const mutations = new MutationObserver(observeControls)
  mutations.observe(host.parentElement!, { childList: true, subtree: true })
  observeControls()
  return () => { observer.disconnect(); mutations.disconnect() }
}

function AstraMoveSheet({ onMove, onClose }: Readonly<{ onMove: (direction: AstraMoveDirection) => void; onClose: () => void }>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  return <Sheet ref={sheetRef} open title={t('shell.astraButton.move')} onClose={onClose}>
    {(['left', 'right', 'up', 'down'] as const).map(direction => <ListRow key={direction} title={t(`shell.astraButton.${direction}`)}
      icon={`arrow-${direction}`} chevron={false} onClick={() => closeSheet(() => { onClose(); onMove(direction) })} />)}
  </Sheet>
}

function useAstraGesture(position: AstraButtonPoint | null, area: AstraButtonArea, hostRef: React.RefObject<HTMLDivElement | null>,
  onDrag: (point: AstraButtonPoint | null) => void, onFinish: (point: AstraButtonPoint) => void, onMoveMenu: () => void) {
  const gesture = useRef<{ pointerId: number; start: AstraButtonPoint; origin: AstraButtonPoint; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const delta = { x: event.clientX - active.start.x, y: event.clientY - active.start.y }
    active.moved ||= Math.hypot(delta.x, delta.y) >= ASTRA_DRAG_THRESHOLD
    if (active.moved) {
      clearTimeout(timer.current)
      suppressClick.current = true
      onDrag(clampAstraButton({ x: active.origin.x + delta.x, y: active.origin.y + delta.y }, area))
    }
  }
  const cancel = () => { clearTimeout(timer.current); gesture.current = null; onDrag(null); suppressClick.current = true }
  const openMoveMenu = () => { cancel(); onMoveMenu() }
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !position) return
      clearTimeout(timer.current)
      suppressClick.current = false
      const bounds = event.currentTarget.getBoundingClientRect()
      const host = hostRef.current!.getBoundingClientRect()
      gesture.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: bounds.left - host.left, y: bounds.top - host.top }, moved: false }
      event.currentTarget.setPointerCapture(event.pointerId)
      timer.current = setTimeout(openMoveMenu, 500)
    },
    onPointerMove: pointerMove,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      clearTimeout(timer.current)
      const active = gesture.current
      if (!active || active.pointerId !== event.pointerId) return
      if (active.moved) onFinish(clampAstraButton({ x: active.origin.x + event.clientX - active.start.x, y: active.origin.y + event.clientY - active.start.y }, area))
      gesture.current = null
    },
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => { event.preventDefault(); openMoveMenu() },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { if (event.detail === 0 || !suppressClick.current) useUIStore.getState().setAstraConversationOpen(true) },
  }
}

export function AstraButton() {
  const t = useTranslations()
  const descriptionId = useId()
  const hostRef = useRef<HTMLDivElement>(null)
  const savedPosition = useRef<AstraButtonPoint | null>(null)
  const [placement, setPlacement] = useState<{ area: AstraButtonArea; obstacles: AstraButtonObstacle[] }>({ area: { width: 0, height: 0 }, obstacles: [] })
  const [saved, setSaved] = useState<AstraButtonPoint | null>(null)
  const [dragged, setDragged] = useState<AstraButtonPoint | null>(null)
  const [snapping, setSnapping] = useState(false)
  const [moving, setMoving] = useState(false)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  const position = dragged ?? snapAstraButton(saved, placement.area, placement.obstacles)
  useEffect(() => {
    const host = hostRef.current!
    let active = true
    const updatePlacement = () => {
      const measured = measurePlacement(host)
      setSnapping(false)
      setPlacement(measured)
      const previous = savedPosition.current
      const next = snapAstraButton(previous, measured.area, measured.obstacles)
      if (previous && next && (previous.x !== next.x || previous.y !== next.y)) {
        savedPosition.current = next
        setSaved(next)
        localStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next))
      }
    }
    let stopObserving: (() => void) | undefined
    void Promise.resolve().then(() => {
      if (!active) return
      savedPosition.current = parseAstraButtonPosition(localStorage.getItem(ASTRA_POSITION_KEY))
      setSaved(savedPosition.current)
      stopObserving = observePlacement(host, updatePlacement)
    })
    return () => { active = false; stopObserving?.() }
  }, [])
  const clearance = position && !blocked ? placement.area.height - position.y + ASTRA_BUTTON_GAP : 0
  useLayoutEffect(() => {
    if (placement.area.width === 0) return
    const page = hostRef.current!.parentElement!
    page.style.setProperty('--shell-astra-clearance', `${clearance}px`)
    return () => { page.style.removeProperty('--shell-astra-clearance') }
  }, [clearance, placement.area.width])
  function finish(point: AstraButtonPoint) {
    const next = snapAstraButton(point, placement.area, placement.obstacles)
    setSnapping(true)
    setDragged(null)
    savedPosition.current = next
    setSaved(next)
    localStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next))
  }
  const gesture = useAstraGesture(position, placement.area, hostRef, point => { setSnapping(false); setDragged(point) }, finish, () => setMoving(true))
  const move = (direction: AstraMoveDirection) => { if (position) finish(moveAstraButton(position, direction, placement.area)) }
  return <div ref={hostRef} data-astra-button-area="" className="pointer-events-none absolute inset-y-0 left-[var(--safe-left)] right-[var(--safe-right)] z-sticky">
    <div hidden={blocked || !position && placement.area.width > 0} data-astra-button-position="" className="pointer-events-auto absolute motion-safe:transition-transform motion-safe:duration-[var(--duration-normal)] ease-[var(--ease-out)]"
      style={{ ...(position ? { left: 0, top: 0, transform: `translate(${position.x}px, ${position.y}px)` } : { right: ASTRA_BUTTON_GAP, bottom: ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP + ASTRA_BUTTON_CLEARANCE }), transitionDuration: dragged || !snapping ? '0ms' : undefined, width: ASTRA_BUTTON_SIZE, height: ASTRA_BUTTON_SIZE }}>
      <Fab neutral label={t('shell.astraButton.open')} data-astra-button="" aria-describedby={descriptionId} title={t('shell.astraButton.keyboardHint')} style={{ touchAction: 'none' }} {...gesture}
        onKeyDown={event => {
          const directions: Record<string, AstraMoveDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
          const direction = directions[event.key]
          if (direction) { event.preventDefault(); move(direction) }
          if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); setMoving(true) }
        }}><AstraGlyph size={24} /></Fab>
      <span id={descriptionId} className="sr-only">{t('shell.astraButton.keyboardHint')}</span>
    </div>
    {moving ? <AstraMoveSheet onMove={move} onClose={() => setMoving(false)} /> : null}
  </div>
}
