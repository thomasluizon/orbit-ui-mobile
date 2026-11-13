'use client'

import {
  ORBIT_MASCOT_BOX_HEIGHT,
  ORBIT_MASCOT_BOX_WIDTH,
  ORBIT_MASCOT_FACES,
  ORBIT_MASCOT_PLANET_RADIUS,
  ORBIT_MASCOT_VIEW_BOX,
  ORBIT_SMALL_FACES,
  orbitBlinkMatrix,
  orbitMascotFrame,
  orbitMascotSizeFor,
  type OrbitEyeShape,
  type OrbitMascotFrame,
  type OrbitMascotProps,
  type OrbitMascotSmallSize,
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
import { useOrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'

const SMALL_BOX_RATIO = 3 / 4
const LIVE_MIN_SIZE = 48
const MAX_FRAME_STEP_MS = 100

function isSmallSize(size: number): size is OrbitMascotSmallSize {
  return size < LIVE_MIN_SIZE
}

/** The idle loop clock in milliseconds. It runs only while this mascot holds the one live slot, the
 *  person has not paused Orbit, no overlay covers its layer, the mascot is on screen and the tab is in
 *  the foreground. It never runs under reduced motion. An Orbit off screen, such as a hidden conversation
 *  entry, gives the slot to the next Orbit in view. */
function useOrbitLoopClock(wantsLoop: boolean, lead: boolean, target: React.RefObject<SVGSVGElement | null>) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const layer = useOrbitOverlayLayer()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const candidate = wantsLoop && !reducedMotion
  const [onScreen, setOnScreen] = useState(true)
  const [foreground, setForeground] = useState(true)
  const [clock, setClock] = useState(0)
  const elapsed = useRef(0)
  useSyncExternalStore(subscribeOrbitLoop, getOrbitLoopVersion, getOrbitLoopVersion)

  useEffect(() => (candidate && onScreen ? claimOrbitLiveSlot(claim, layer, lead) : undefined), [candidate, onScreen, claim, layer, lead])

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
      if (previous !== null) elapsed.current += Math.min(now - previous, MAX_FRAME_STEP_MS)
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

function Eye({ shape, blink }: Readonly<{ shape: OrbitEyeShape; blink?: string }>) {
  if (shape.kind === 'fill') return <path d={shape.d} fill="var(--bg)" transform={blink} data-part="eye" />
  return (
    <path
      d={shape.d}
      fill="none"
      stroke="var(--bg)"
      strokeWidth={shape.width}
      strokeLinecap="round"
      data-part="eye"
    />
  )
}

function Moon({ frame }: Readonly<{ frame: OrbitMascotFrame }>) {
  return <circle cx={frame.moon.x} cy={frame.moon.y} r={frame.moon.radius} fill="var(--primary)" data-part="moon" />
}

function Rig({ state, frame, clipId }: Readonly<{ state: NonNullable<OrbitMascotProps['state']>; frame: OrbitMascotFrame; clipId: string }>) {
  const face = ORBIT_MASCOT_FACES[state]
  const blink = face.blinkCentreY === null ? undefined : orbitBlinkMatrix(frame.blinkScale, face.blinkCentreY)
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} />
        </clipPath>
      </defs>
      <path d={frame.ringBack} fill="currentColor" />
      {frame.moon.front ? null : <Moon frame={frame} />}
      <circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} fill="currentColor" />
      {face.eyes.map((shape) => (
        <Eye key={shape.d} shape={shape} blink={blink} />
      ))}
      <g clipPath={`url(#${clipId})`}>
        <path d={frame.ringOutline} fill="var(--orbit-surface, var(--bg))" />
      </g>
      <path d={frame.ringFront} fill="currentColor" />
      {frame.moon.front ? <Moon frame={frame} /> : null}
    </>
  )
}

function SmallFace({ size, clipId }: Readonly<{ size: OrbitMascotSmallSize; clipId: string }>) {
  const face = ORBIT_SMALL_FACES[size]
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={face.planet} />
        </clipPath>
      </defs>
      <path d={face.ringBack} fill="currentColor" />
      <path d={face.planet} fill="currentColor" />
      {face.eyes.map((eye) => (
        <path key={eye} d={eye} fill="var(--bg)" data-part="eye" />
      ))}
      <g clipPath={`url(#${clipId})`}>
        <path d={face.ringOutline} fill="var(--orbit-surface, var(--bg))" />
      </g>
      <path d={face.ringFront} fill="currentColor" />
      <path d={face.moon} fill="var(--primary)" data-part="moon" />
    </>
  )
}

export function OrbitMascot({ size, state = 'parado', still = false, color, lead = false }: Readonly<OrbitMascotProps>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const small = isSmallSize(size)
  const { clock, running } = useOrbitLoopClock(!small && !still, lead, svgRef)
  const frame = orbitMascotFrame(clock, mascotMotion)

  return (
    <svg
      ref={svgRef}
      width={size}
      height={small ? size * SMALL_BOX_RATIO : (size * ORBIT_MASCOT_BOX_HEIGHT) / ORBIT_MASCOT_BOX_WIDTH}
      viewBox={small ? ORBIT_SMALL_FACES[size].viewBox : ORBIT_MASCOT_VIEW_BOX}
      fill="none"
      color={color ?? 'var(--fg-1)'}
      aria-hidden="true"
      data-asset="orbit-mascot"
      data-orbit-state={state}
      data-orbit-face={small ? 'small' : 'rig'}
      data-orbit-loop={running ? 'running' : 'still'}
    >
      {small ? <SmallFace size={size} clipId={clipId} /> : <Rig state={state} frame={frame} clipId={clipId} />}
    </svg>
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
