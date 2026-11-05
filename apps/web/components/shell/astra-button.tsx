'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ASTRA_BUTTON_SIZE, ASTRA_DRAG_THRESHOLD, ASTRA_POSITION_KEY, clampAstraButton, moveAstraButton, parseAstraButtonPosition, snapAstraButton, type AstraButtonArea, type AstraButtonObstacle, type AstraButtonPoint, type AstraMoveDirection } from '@orbit/shared/utils'
import { Fab } from '@/components/ui/fab'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useUIStore } from '@/stores/ui-store'

function measurePlacement(host: HTMLDivElement) {
  const bounds = host.getBoundingClientRect()
  const obstacles = [...host.parentElement!.querySelectorAll<HTMLElement>('[data-shell-fab], [data-shell-scroll-to-top]>div')].flatMap(element => {
    const rect = element.getBoundingClientRect()
    return rect.width && rect.height ? [{ x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }] : []
  })
  return { area: { width: bounds.width, height: bounds.height }, obstacles }
}

export function AstraButton() {
  const t = useTranslations()
  const descriptionId = useId()
  const hostRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointerId: number; start: AstraButtonPoint; origin: AstraButtonPoint; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const savedPosition = useRef<AstraButtonPoint | null>(null)
  const [placement, setPlacement] = useState<{ area: AstraButtonArea; obstacles: AstraButtonObstacle[] }>({ area: { width: 0, height: 0 }, obstacles: [] })
  const [saved, setSaved] = useState<AstraButtonPoint | null>(null)
  const [dragged, setDragged] = useState<AstraButtonPoint | null>(null)
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  const position = dragged ?? snapAstraButton(saved, placement.area, placement.obstacles)
  useEffect(() => {
    const host = hostRef.current!
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      savedPosition.current = parseAstraButtonPosition(localStorage.getItem(ASTRA_POSITION_KEY))
      setSaved(savedPosition.current)
      updatePlacement()
    })
    const updatePlacement = () => {
      const measured = measurePlacement(host)
      setPlacement(measured)
      const previous = savedPosition.current
      const next = snapAstraButton(previous, measured.area, measured.obstacles)
      if (!gesture.current && previous && next && (previous.x !== next.x || previous.y !== next.y)) {
        savedPosition.current = next
        setSaved(next)
        localStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next))
      }
      host.parentElement!.querySelectorAll<HTMLElement>('[data-shell-fab], [data-shell-scroll-to-top]').forEach(element => observer.observe(element))
    }
    const observer = new ResizeObserver(updatePlacement)
    observer.observe(host)
    host.parentElement!.querySelectorAll<HTMLElement>('[data-shell-fab], [data-shell-scroll-to-top]').forEach(element => observer.observe(element))
    const mutations = new MutationObserver(updatePlacement)
    mutations.observe(host.parentElement!, { childList: true, subtree: true })
    return () => { active = false; observer.disconnect(); mutations.disconnect() }
  }, [])

  function finish(point: AstraButtonPoint) {
    const next = snapAstraButton(point, placement.area, placement.obstacles)
    setDragged(null)
    savedPosition.current = next
    setSaved(next)
    localStorage.setItem(ASTRA_POSITION_KEY, JSON.stringify(next))
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const delta = { x: event.clientX - active.start.x, y: event.clientY - active.start.y }
    active.moved ||= Math.hypot(delta.x, delta.y) >= ASTRA_DRAG_THRESHOLD
    if (active.moved) {
      suppressClick.current = true
      setDragged(clampAstraButton({ x: active.origin.x + delta.x, y: active.origin.y + delta.y }, placement.area))
    }
  }
  return <div ref={hostRef} data-astra-button-area="" className="pointer-events-none absolute inset-y-0 left-[var(--safe-left)] right-[var(--safe-right)] z-sticky">
    {position || placement.area.width === 0 ? <div hidden={blocked} data-astra-button-position="" className="pointer-events-auto absolute motion-safe:transition-transform motion-safe:duration-[var(--duration-normal)] ease-[var(--ease-out)]"
      style={{ ...(position ? { left: 0, top: 0, transform: `translate(${position.x}px, ${position.y}px)` } : { right: 16, bottom: 92 }), transitionDuration: dragged ? '0ms' : undefined, width: ASTRA_BUTTON_SIZE, height: ASTRA_BUTTON_SIZE }}>
      <Fab neutral label={t('shell.astraButton.open')} data-astra-button="" aria-describedby={descriptionId} style={{ touchAction: 'none' }}
        onPointerDown={event => {
          if (event.button !== 0 || !position) return
          suppressClick.current = false
          const bounds = event.currentTarget.getBoundingClientRect()
          const host = hostRef.current!.getBoundingClientRect()
          gesture.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: bounds.left - host.left, y: bounds.top - host.top }, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }} onPointerMove={pointerMove}
        onPointerUp={event => {
          if (gesture.current?.pointerId !== event.pointerId) return
          if (gesture.current.moved) finish(clampAstraButton({ x: gesture.current.origin.x + event.clientX - gesture.current.start.x, y: gesture.current.origin.y + event.clientY - gesture.current.start.y }, placement.area))
          gesture.current = null
        }} onPointerCancel={() => { gesture.current = null; setDragged(null); suppressClick.current = true }}
        onClick={event => { if (event.detail === 0 || !suppressClick.current) openConversation(true) }}
        onKeyDown={event => {
          const directions: Record<string, AstraMoveDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
          const direction = directions[event.key]
          if (direction && position) { event.preventDefault(); finish(moveAstraButton(position, direction, placement.area)) }
        }}><AstraGlyph size={24} /></Fab>
      <span id={descriptionId} className="sr-only">{t('shell.astraButton.keyboardHint')}</span>
    </div> : null}
  </div>
}
