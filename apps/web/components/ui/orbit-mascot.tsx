'use client'

import {
  isOrbitMascotSmallSize,
  orbitEyeOffset,
  orbitMascotDrawnFrame,
  orbitMascotSizeFor,
  orbitRingTurnProgress,
  orbitSmallFaceFrame,
  resolveOrbitShownState,
  type OrbitLiveRole,
  type OrbitMascotProps,
} from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
import {
  claimOrbitLiveSlot,
  getOrbitLoopVersion,
  mayOrbitRunLoop,
  runOrbitLoopClock,
  runOrbitReadClock,
  subscribeOrbitLoop,
} from '@orbit/shared/utils'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useOrbitOverlay } from '@/components/ui/orbit-overlay-layer'
import { useOrbitReadMotionAllowed } from '@/components/ui/orbit-read-motion'
import { OrbitMascotDrawing } from '@/components/ui/orbit-mascot-drawing'

function useOrbitLoopClock(wantsLoop: boolean, role: OrbitLiveRole, target: React.RefObject<SVGSVGElement | null>) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const overlay = useOrbitOverlay()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const candidate = wantsLoop && !reducedMotion
  const [onScreen, setOnScreen] = useState(true)
  const [foreground, setForeground] = useState(true)
  const [clock, setClock] = useState(0)
  const drawn = useRef(0)
  useSyncExternalStore(subscribeOrbitLoop, getOrbitLoopVersion, getOrbitLoopVersion)

  useEffect(() => (candidate && onScreen ? claimOrbitLiveSlot(claim, overlay, role) : undefined), [candidate, onScreen, claim, overlay, role])

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
    return runOrbitLoopClock(globalThis, drawn.current, (time) => {
      drawn.current = time
      setClock(time)
    })
  }, [running])

  return { clock: candidate ? clock : 0, running }
}

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

function useOrbitReadClock(reading: boolean) {
  const motionAllowed = useOrbitReadMotionAllowed()
  const running = reading && motionAllowed
  const [clock, setClock] = useState(0)
  const [wasRunning, setWasRunning] = useState(running)
  if (wasRunning !== running) {
    setWasRunning(running)
    setClock(0)
  }

  useEffect(() => (running ? runOrbitReadClock(globalThis, setClock) : undefined), [running])

  return { clock: running ? clock : 0, running }
}

export function OrbitMascot({ size, state = 'parado', still = false, reading = false, color, live = 'single', lookAt = null, turnKey }: Readonly<OrbitMascotProps>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const small = isOrbitMascotSmallSize(size)
  const { clock, running } = useOrbitLoopClock(!small && !still, live, svgRef)
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const turn = useRingTurn(turnKey, !small && !still && !reducedMotion)
  const frame = orbitMascotDrawnFrame(clock, mascotMotion, running, turn)
  const eyeOffset = orbitEyeOffset(lookAt, reducedMotion || still)
  const read = useOrbitReadClock(small && reading)
  const smallMotion = small && read.running ? orbitSmallFaceFrame(read.clock, size, mascotMotion) : undefined

  return (
    <OrbitMascotDrawing
      ref={svgRef}
      size={size}
      state={state}
      shownState={small ? state : resolveOrbitShownState(state, lookAt)}
      color={color}
      clipId={clipId}
      frame={frame}
      smallMotion={smallMotion}
      running={running || read.running}
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
