'use client'

import {
  ORBIT_MASCOT_FACES,
  ORBIT_MASCOT_VIEW_BOX,
  isOrbitMascotSmallSize,
  orbitBlinkMatrix,
  orbitEyeOffset,
  orbitMascotDrawnFrame,
  orbitMascotSizeFor,
  orbitOutlineCutout,
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
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useOrbitOverlay } from '@/components/ui/orbit-overlay-layer'
import { useOrbitReadMotionAllowed } from '@/components/ui/orbit-read-motion'
import { OrbitMascotDrawing } from '@/components/ui/orbit-mascot-drawing'

function useOrbitLoopState(wantsLoop: boolean, role: OrbitLiveRole, target: React.RefObject<SVGSVGElement | null>) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const overlay = useOrbitOverlay()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const candidate = wantsLoop && !reducedMotion
  const [onScreen, setOnScreen] = useState(true)
  const [foreground, setForeground] = useState(true)
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

  return { candidate, running: candidate && onScreen && foreground && mayOrbitRunLoop(claim) }
}

function setParts(svg: SVGSVGElement, name: string, attributes: Record<string, string | number | undefined>) {
  for (const part of svg.querySelectorAll(`[data-part="${name}"]`)) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined) part.removeAttribute(key)
      else part.setAttribute(key, String(value))
    }
  }
}

function placeMoon(svg: SVGSVGElement, front: boolean) {
  const moon = svg.querySelector('[data-part="moon"]')
  const anchor = svg.querySelector(`[data-part="ring-${front ? 'front' : 'back'}"]`)
  if (moon && anchor && anchor.nextElementSibling !== moon) anchor.after(moon)
}

interface Pose {
  time: number
  read: number
  turn: number
}

interface PoseInputs {
  readonly size: OrbitMascotProps['size']
  readonly state: NonNullable<OrbitMascotProps['state']>
  readonly eyeOffset: { readonly x: number; readonly y: number }
  readonly candidate: boolean
  readonly running: boolean
  readonly readRunning: boolean
  readonly turnKey: string | number | undefined
  readonly turnEnabled: boolean
}

function useOrbitPose(svgRef: React.RefObject<SVGSVGElement | null>, inputs: PoseInputs) {
  const { size, state, eyeOffset, candidate, running, readRunning, turnKey, turnEnabled } = inputs
  const pose = useRef<Pose>({ time: 0, read: 0, turn: 0 })
  const paint = useRef(() => {})
  const seen = useRef(turnKey)

  useLayoutEffect(() => {
    paint.current = () => {
      const svg = svgRef.current
      if (!svg) return
      svg.setAttribute('data-orbit-turn', pose.current.turn > 0 ? 'turning' : 'rest')
      if (isOrbitMascotSmallSize(size)) {
        const motion = readRunning ? orbitSmallFaceFrame(pose.current.read, size, mascotMotion) : undefined
        for (const name of ['ring-back', 'ring-front', 'outline-cutout']) setParts(svg, name, { transform: motion?.ring })
        setParts(svg, 'moon', { transform: motion?.moon })
        setParts(svg, 'eye', { transform: motion?.eyes })
        placeMoon(svg, motion?.moonFront ?? true)
        return
      }
      const frame = orbitMascotDrawnFrame(candidate ? pose.current.time : 0, mascotMotion, running, pose.current.turn)
      const centreY = ORBIT_MASCOT_FACES[state].blinkCentreY
      setParts(svg, 'ring-back', { d: frame.ringBack })
      setParts(svg, 'ring-front', { d: frame.ringFront })
      setParts(svg, 'outline-cutout', { d: orbitOutlineCutout(ORBIT_MASCOT_VIEW_BOX, frame.ringOutline) })
      setParts(svg, 'moon', { cx: frame.moon.x, cy: frame.moon.y, r: frame.moon.radius })
      placeMoon(svg, frame.moon.front)
      setParts(svg, 'eyes', { transform: `translate(${eyeOffset.x} ${eyeOffset.y})${frame.eyeWiden === 1 ? '' : ` scale(${frame.eyeWiden} 1)`}` })
      setParts(svg, 'eye', { transform: centreY === null ? undefined : orbitBlinkMatrix(frame.blinkScale, centreY) })
    }
    paint.current()
  })

  useEffect(() => {
    if (!running) return undefined
    return runOrbitLoopClock(globalThis, pose.current.time, (time) => {
      if (time === pose.current.time) return
      pose.current.time = time
      paint.current()
    })
  }, [running])

  useEffect(() => {
    if (!readRunning) return undefined
    const current = pose.current
    const stop = runOrbitReadClock(globalThis, (time) => {
      if (time === current.read) return
      current.read = time
      paint.current()
    })
    return () => {
      stop()
      current.read = 0
    }
  }, [readRunning])

  useEffect(() => {
    if (seen.current === turnKey) return undefined
    seen.current = turnKey
    if (!turnEnabled) return undefined
    let frame = 0
    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const next = orbitRingTurnProgress(now - start, mascotMotion.ringTurn)
      pose.current.turn = next >= 1 ? 0 : next
      paint.current()
      if (now - start < mascotMotion.ringTurn) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [turnKey, turnEnabled])
}

export function OrbitMascot({ size, state = 'parado', still = false, reading = false, color, live = 'single', lookAt = null, turnKey }: Readonly<OrbitMascotProps>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const small = isOrbitMascotSmallSize(size)
  const { candidate, running } = useOrbitLoopState(!small && !still, live, svgRef)
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const eyeOffset = orbitEyeOffset(lookAt, reducedMotion || still)
  const readRunning = useOrbitReadMotionAllowed() && small && reading
  useOrbitPose(svgRef, { size, state, eyeOffset, candidate, running, readRunning, turnKey, turnEnabled: !small && !still && !reducedMotion })

  return (
    <OrbitMascotDrawing
      ref={svgRef}
      size={size}
      state={state}
      shownState={small ? state : resolveOrbitShownState(state, lookAt)}
      color={color}
      clipId={clipId}
      running={running || readRunning}
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
