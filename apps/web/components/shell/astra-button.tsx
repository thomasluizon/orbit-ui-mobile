'use client'

import { useEffect, useLayoutEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import { SHELL_CONTENT_MAX_WIDTH, TAB_BAR_MIN_HEIGHT } from '@orbit/shared/theme'
import { ASTRA_BUTTON_SIZE, ASTRA_BUTTON_GAP, ASTRA_BUTTON_CLEARANCE, ASTRA_BUTTON_AT_REST, ASTRA_POSITION_KEY, advanceAstraButtonGesture, getAstraButtonClearance, moveAstraButton, parseAstraButtonPosition, resolveAstraButtonArea, snapAstraButton, type AstraButtonArea, type AstraButtonGesture, type AstraButtonGestureEvent, type AstraButtonObstacle, type AstraButtonPoint, type AstraMoveDirection } from '@orbit/shared/utils'
import { Fab } from '@/components/ui/fab'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useUIStore } from '@/stores/ui-store'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ListRow } from '@/components/ui/list-row'

const FLOOR_SELECTOR = '[data-shell-tab-bar], [data-shell-notice-content], [data-shell-pinned-content]'
const OBSTACLE_SELECTOR = '[data-shell-fab], [data-shell-scroll-to-top]>div'

interface AstraPlacement { area: AstraButtonArea; obstacles: AstraButtonObstacle[]; pageBottom: number }

function measurePlacement(host: HTMLDivElement, shell: HTMLElement): AstraPlacement {
  const bounds = host.getBoundingClientRect()
  const floors = [...shell.querySelectorAll<HTMLElement>(FLOOR_SELECTOR)].flatMap(element => {
    const rect = element.getBoundingClientRect()
    return rect.height ? [rect.top] : []
  })
  const obstacles = [...shell.querySelectorAll<HTMLElement>(OBSTACLE_SELECTOR)].flatMap(element => {
    const rect = element.getBoundingClientRect()
    return rect.width && rect.height ? [{ x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }] : []
  })
  const page = shell.querySelector('[data-shell-page]')!.getBoundingClientRect()
  const column = shell.querySelector('[data-shell-page-content]')!.getBoundingClientRect()
  return { area: resolveAstraButtonArea(bounds, floors, { start: column.left - bounds.left, end: column.right - bounds.left }), obstacles, pageBottom: page.bottom - bounds.top }
}

function observePlacement(host: HTMLDivElement, shell: HTMLElement, update: () => void) {
  const observer = new ResizeObserver(update)
  let observed: Element[] = []
  const observeControls = () => {
    if (!host.isConnected) return
    const controls = [host, ...shell.querySelectorAll(`[data-shell-page], ${FLOOR_SELECTOR}, ${OBSTACLE_SELECTOR}`)]
    if (controls.length !== observed.length || controls.some((element, index) => element !== observed[index])) {
      observed = controls
      observer.disconnect()
      for (const element of controls) observer.observe(element)
    }
    update()
  }
  const mutations = new MutationObserver(observeControls)
  mutations.observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
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
  const gesture = useRef<AstraButtonGesture>(ASTRA_BUTTON_AT_REST)
  const pointerId = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  function advance(event: AstraButtonGestureEvent) {
    gesture.current = advanceAstraButtonGesture(gesture.current, event, area)
    if (gesture.current.phase === 'dragging' || gesture.current.phase === 'settled') {
      clearTimeout(timer.current)
      suppressClick.current = true
    }
    if (gesture.current.phase === 'dragging') onDrag(gesture.current.point)
    if (gesture.current.phase === 'settled') onFinish(gesture.current.point)
  }
  function follow(event: PointerEvent<HTMLButtonElement>, type: 'move' | 'release') {
    if (pointerId.current === event.pointerId) advance({ type, pointer: { x: event.clientX, y: event.clientY } })
  }
  const cancel = () => { clearTimeout(timer.current); pointerId.current = null; advance({ type: 'cancel' }); onDrag(null); suppressClick.current = true }
  const openMoveMenu = () => { cancel(); onMoveMenu() }
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !position) return
      clearTimeout(timer.current)
      suppressClick.current = false
      const bounds = event.currentTarget.getBoundingClientRect()
      const host = hostRef.current!.getBoundingClientRect()
      pointerId.current = event.pointerId
      advance({ type: 'press', pointer: { x: event.clientX, y: event.clientY }, origin: { x: bounds.left - host.left, y: bounds.top - host.top } })
      event.currentTarget.setPointerCapture(event.pointerId)
      timer.current = setTimeout(openMoveMenu, 500)
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => follow(event, 'move'),
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      clearTimeout(timer.current)
      follow(event, 'release')
      pointerId.current = null
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
  const [placement, setPlacement] = useState<AstraPlacement>({ area: { width: 0, height: 0, column: { start: 0, end: 0 } }, obstacles: [], pageBottom: 0 })
  const [saved, setSaved] = useState<AstraButtonPoint | null>(null)
  const [dragged, setDragged] = useState<AstraButtonPoint | null>(null)
  const [snapping, setSnapping] = useState(false)
  const [moving, setMoving] = useState(false)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  const position = dragged ?? snapAstraButton(saved, placement.area, placement.obstacles)
  useEffect(() => {
    const host = hostRef.current!
    const shell = host.parentElement!
    let active = true
    let previousMeasure = ''
    const updatePlacement = () => {
      const measured = measurePlacement(host, shell)
      const serialized = JSON.stringify(measured)
      if (serialized === previousMeasure) return
      previousMeasure = serialized
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
      stopObserving = observePlacement(host, shell, updatePlacement)
    })
    return () => { active = false; stopObserving?.() }
  }, [])
  const clearance = blocked ? 0 : getAstraButtonClearance(position, placement.pageBottom)
  useLayoutEffect(() => {
    if (placement.area.width === 0) return
    const page = hostRef.current!.parentElement!.querySelector<HTMLElement>('[data-shell-page]')!
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
  return <div ref={hostRef} data-astra-button-area="" className="pointer-events-none absolute bottom-0 left-[var(--safe-left)] right-[var(--safe-right)] top-0 z-modal-backdrop lg:hidden">
    <div hidden={blocked || !position && placement.area.width > 0} data-astra-button-position="" className="pointer-events-auto absolute motion-safe:transition-transform motion-safe:duration-[var(--duration-normal)] ease-[var(--ease-out)]"
      style={{ ...(position ? { left: 0, top: 0, transform: `translate(${position.x}px, ${position.y}px)` } : { right: `max(${ASTRA_BUTTON_GAP}px, calc((100% - ${SHELL_CONTENT_MAX_WIDTH}px) / 2 + ${ASTRA_BUTTON_GAP}px))`, bottom: TAB_BAR_MIN_HEIGHT + ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP + ASTRA_BUTTON_CLEARANCE }), transitionDuration: dragged || !snapping ? '0ms' : undefined, width: ASTRA_BUTTON_SIZE, height: ASTRA_BUTTON_SIZE }}>
      <Fab neutral lifted={dragged !== null} label={t('shell.astraButton.open')} data-astra-button="" aria-describedby={descriptionId} title={t('shell.astraButton.keyboardHint')} style={{ touchAction: 'none' }} {...gesture}
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
