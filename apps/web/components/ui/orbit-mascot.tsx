'use client'

import {
  ORBIT_MASCOT_MAX_FRAME_STEP_MS,
  isOrbitMascotSmallSize,
  orbitMascotFrame,
  orbitMascotSizeFor,
  orbitEyeOffset,
  orbitRingTurnProgress,
  resolveOrbitShownState,
  type OrbitMascotFrame,
  type OrbitMascotProps,
} from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
import {
  claimOrbitLiveSlot,
  getOrbitLoopVersion,
  mayOrbitRunLoop,
  subscribeOrbitLoop,
} from '@orbit/shared/utils'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useOrbitOverlay } from '@/components/ui/orbit-overlay-layer'
import { OrbitMascotDrawing } from '@/components/ui/orbit-mascot-drawing'

/** The idle loop clock in milliseconds. It runs only while this mascot holds the one live slot, the
 *  person has not paused Orbit, it sits in the overlay opened last (or on the page), the mascot is on screen and the tab is in
 *  the foreground. It never runs under reduced motion. An Orbit off screen, such as a hidden conversation
 *  entry, gives the slot to the next Orbit in view. */
function useOrbitLoopClock(wantsLoop: boolean, lead: boolean, target: React.RefObject<SVGSVGElement | null>) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const overlay = useOrbitOverlay()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const candidate = wantsLoop && !reducedMotion
  const [onScreen, setOnScreen] = useState(true)
  const [foreground, setForeground] = useState(true)
  const [clock, setClock] = useState(0)
  const elapsed = useRef(0)
  useSyncExternalStore(subscribeOrbitLoop, getOrbitLoopVersion, getOrbitLoopVersion)

  useEffect(() => (candidate && onScreen ? claimOrbitLiveSlot(claim, overlay, lead) : undefined), [candidate, onScreen, claim, overlay, lead])

  useEffect(() => {
    const element = target.current
    if (!candidate || !element || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver((entries) => setOnScreen(entries.at(-1)?.isIntersecting ?? true))
    observer.observe(element)
    return () => observer.disconnect()
  }, [candidate, target])

  useEffect(() => {
    if (!candidate) return undefined
    const update = () => setForeground(document.visibilityState !== 'hidden')
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [candidate, claim])

  const running = candidate && onScreen && foreground && mayOrbitRunLoop(claim)

  useEffect(() => {
    if (!running) return undefined
    let frame = 0
    let previous: number | null = null
    let lastDraw = 0
    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      if (previous !== null) elapsed.current += Math.min(now - previous, ORBIT_MASCOT_MAX_FRAME_STEP_MS)
      previous = now
      if (now - lastDraw < mascotMotion.frameInterval) return
      lastDraw = now
      setClock(elapsed.current)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [running])

  return { clock: candidate ? clock : 0, running }
}

/** One ring turn when `turnKey` changes. The first value draws no turn, reduced motion and a still face draw none, and a new value restarts the turn so turns never queue. */
function useRingTurn(turnKey: string | number | undefined, enabled: boolean): number {
  const [progress, setProgress] = useState(0)
  const seen = useRef(turnKey)
  useEffect(() => {
    if (seen.current === turnKey) return undefined
    seen.current = turnKey
    if (!enabled) return undefined
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const next = orbitRingTurnProgress(now - start, mascotMotion.ringTurn)
      setProgress(next >= 1 ? 0 : next)
      if (now - start < mascotMotion.ringTurn) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [turnKey, enabled])
  return progress
}

/** A paused Orbit keeps its pose, but its eyes are open: half-closed eyes held still read as Descansando. */
function pausedFrame(frame: OrbitMascotFrame, running: boolean): OrbitMascotFrame {
  return running ? frame : { ...frame, blinkScale: 1 }
}

export function OrbitMascot({ size, state = 'parado', still = false, color, lead = false, lookAt = null, turnKey }: Readonly<OrbitMascotProps>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const small = isOrbitMascotSmallSize(size)
  const { clock, running } = useOrbitLoopClock(!small && !still, lead, svgRef)
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const turn = useRingTurn(turnKey, !small && !still && !reducedMotion)
  const frame = pausedFrame(orbitMascotFrame(clock, mascotMotion, turn), running)
  const eyeOffset = orbitEyeOffset(lookAt, reducedMotion || still)

  return (
    <OrbitMascotDrawing
      ref={svgRef}
      size={size}
      state={state}
      shownState={small ? state : resolveOrbitShownState(state, lookAt)}
      color={color}
      clipId={clipId}
      frame={frame}
      running={running}
      turning={turn > 0}
      eyeOffset={eyeOffset}
    />
  )
}

/** The AI marker where a slot takes an icon component: the small static face at the tier of the slot. */
export function OrbitMascotIcon({ size = 24, color }: Readonly<{ size?: number; color?: string; [key: string]: unknown }>) {
  return <OrbitMascot size={orbitMascotSizeFor(size)} color={color === 'currentColor' ? undefined : color} still />
}

/** The mascot size of a state surface: 96 in the compact shell, 128 at 1024 and above. */
export function useStateMascotSize(): 96 | 128 {
  return useViewportMatch('(min-width: 1024px)') ? 128 : 96
}
