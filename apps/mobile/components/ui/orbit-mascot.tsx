import {
  ORBIT_MASCOT_FACES,
  ORBIT_MASCOT_MAX_FRAME_STEP_MS,
  ORBIT_MASCOT_PLANET_RADIUS,
  ORBIT_MASCOT_VIEW_BOX,
  ORBIT_SMALL_FACES,
  isOrbitMascotSmallSize,
  orbitBlinkMatrix,
  orbitMascotFrame,
  orbitPausedFrame,
  orbitMascotHeight,
  orbitMascotSizeFor,
  orbitOutlineCutout,
  orbitRingTurnProgress,
  orbitEyeOffset,
  resolveOrbitShownState,
  type OrbitEyeShape,
  type OrbitMascotFrame,
  type OrbitMascotProps,
  type OrbitMascotSmallSize,
} from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
import {
  claimOrbitLiveSlot,
  getOrbitLoopVersion,
  isOrbitMotionEnabled,
  mayOrbitRunLoop,
  subscribeOrbitLoop,
} from '@orbit/shared/utils'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { AppState, useWindowDimensions } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useOrbitOverlay } from '@/components/ui/orbit-overlay-layer'
import { useOrbitScreenFocused } from '@/components/ui/orbit-screen-focus'

const ON_SCREEN_PROBE_MS = 250

interface WindowMeasurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void
}

function useOnScreen(target: RefObject<WindowMeasurable | null>, active: boolean): boolean {
  const [onScreen, setOnScreen] = useState(true)
  const { width, height } = useWindowDimensions()
  useEffect(() => {
    if (!active) return undefined
    const probe = () => {
      target.current?.measureInWindow((x, y, boxWidth, boxHeight) => {
        setOnScreen(boxWidth > 0 && boxHeight > 0 && x < width && y < height && x + boxWidth > 0 && y + boxHeight > 0)
      })
    }
    probe()
    const timer = setInterval(probe, ON_SCREEN_PROBE_MS)
    return () => clearInterval(timer)
  }, [active, target, width, height])
  return onScreen
}

function useOrbitLoopClock(wantsLoop: boolean, lead: boolean, target: RefObject<WindowMeasurable | null>) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const overlay = useOrbitOverlay()
  const reducedMotion = usePrefersReducedMotion()
  const screenFocused = useOrbitScreenFocused()
  const candidate = wantsLoop && !reducedMotion && screenFocused
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const onScreen = useOnScreen(target, candidate && foreground && isOrbitMotionEnabled())
  const [clock, setClock] = useState(0)
  const elapsed = useRef(0)
  useSyncExternalStore(subscribeOrbitLoop, getOrbitLoopVersion, getOrbitLoopVersion)

  useEffect(() => (candidate && onScreen ? claimOrbitLiveSlot(claim, overlay, lead) : undefined), [candidate, onScreen, claim, overlay, lead])

  useEffect(() => {
    if (!candidate) return undefined
    const update = (status: string) => setForeground(status === 'active')
    update(AppState.currentState)
    const subscription = AppState.addEventListener('change', update)
    return () => subscription.remove()
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

function useRingTurn(turnKey: string | number | undefined, enabled: boolean): number {
  const [progress, setProgress] = useState(0)
  const seen = useRef(turnKey)
  useEffect(() => {
    if (seen.current === turnKey) return undefined
    seen.current = turnKey
    if (!enabled) return undefined
    let frame = 0
    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const next = orbitRingTurnProgress(now - start, mascotMotion.ringTurn)
      setProgress(next >= 1 ? 0 : next)
      if (now - start < mascotMotion.ringTurn) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [turnKey, enabled])
  return progress
}

interface Palette {
  readonly eye: string
  readonly moon: string
}

function Eye({ shape, palette, blink }: Readonly<{ shape: OrbitEyeShape; palette: Palette; blink?: string }>) {
  if (shape.kind === 'fill') return <Path d={shape.d} fill={palette.eye} transform={blink} />
  return <Path d={shape.d} fill="none" stroke={palette.eye} strokeWidth={shape.width} strokeLinecap="round" />
}

function Moon({ frame, palette }: Readonly<{ frame: OrbitMascotFrame; palette: Palette }>) {
  return <Circle cx={frame.moon.x} cy={frame.moon.y} r={frame.moon.radius} fill={palette.moon} />
}

function Planet({ viewBox, outline, clipId, children }: Readonly<{ viewBox: string; outline: string; clipId: string; children: ReactNode }>) {
  return (
    <>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={orbitOutlineCutout(viewBox, outline)} clipRule="evenodd" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`} clipRule="evenodd">
        {children}
      </G>
    </>
  )
}

function Rig({ state, frame, palette, clipId, eyeOffset }: Readonly<{ state: NonNullable<OrbitMascotProps['state']>; frame: OrbitMascotFrame; palette: Palette; clipId: string; eyeOffset: { readonly x: number; readonly y: number } }>) {
  const face = ORBIT_MASCOT_FACES[state]
  const blink = face.blinkCentreY === null ? undefined : orbitBlinkMatrix(frame.blinkScale, face.blinkCentreY)
  return (
    <>
      <Path d={frame.ringBack} fill="currentColor" />
      {frame.moon.front ? null : <Moon frame={frame} palette={palette} />}
      <Planet viewBox={ORBIT_MASCOT_VIEW_BOX} outline={frame.ringOutline} clipId={clipId}>
        <Circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} fill="currentColor" />
        <G transform={`translate(${eyeOffset.x} ${eyeOffset.y})${frame.eyeWiden === 1 ? '' : ` scale(${frame.eyeWiden} 1)`}`}>
          {face.eyes.map((shape) => (
            <Eye key={shape.d} shape={shape} palette={palette} blink={blink} />
          ))}
        </G>
      </Planet>
      <Path d={frame.ringFront} fill="currentColor" />
      {frame.moon.front ? <Moon frame={frame} palette={palette} /> : null}
    </>
  )
}

function SmallFace({ size, palette, clipId }: Readonly<{ size: OrbitMascotSmallSize; palette: Palette; clipId: string }>) {
  const face = ORBIT_SMALL_FACES[size]
  return (
    <>
      <Path d={face.ringBack} fill="currentColor" />
      <Planet viewBox={face.viewBox} outline={face.ringOutline} clipId={clipId}>
        <Path d={face.planet} fill="currentColor" />
        {face.eyes.map((eye) => (
          <Path key={eye} d={eye} fill={palette.eye} />
        ))}
      </Planet>
      <Path d={face.ringFront} fill="currentColor" />
      <Path d={face.moon} fill={palette.moon} />
    </>
  )
}

function paletteFrom(tokens: AppTokensV2): Palette {
  return { eye: tokens.bg, moon: tokens.primary }
}

type MobileOrbitMascotProps = OrbitMascotProps & {
  tokens?: AppTokensV2
}

export function OrbitMascot({ tokens, ...props }: Readonly<MobileOrbitMascotProps>) {
  return tokens ? <OrbitMascotDrawing {...props} tokens={tokens} /> : <ThemedOrbitMascot {...props} />
}

function ThemedOrbitMascot(props: Readonly<OrbitMascotProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  return <OrbitMascotDrawing {...props} tokens={tokens} />
}

function OrbitMascotDrawing({ size, state = 'parado', still = false, color, lead = false, lookAt = null, turnKey, tokens }: Readonly<OrbitMascotProps & { tokens: AppTokensV2 }>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const svgRef = useRef<Svg | null>(null)
  const small = isOrbitMascotSmallSize(size)
  const { clock, running } = useOrbitLoopClock(!small && !still, lead, svgRef)
  const reducedMotion = usePrefersReducedMotion()
  const turn = useRingTurn(turnKey, !small && !still && !reducedMotion)
  const frame = orbitPausedFrame(orbitMascotFrame(clock, mascotMotion, turn), running)
  const palette = paletteFrom(tokens)
  const eyeOffset = orbitEyeOffset(lookAt, reducedMotion || still)

  return (
    <Svg
      ref={svgRef}
      width={size}
      height={orbitMascotHeight(size)}
      viewBox={small ? ORBIT_SMALL_FACES[size].viewBox : ORBIT_MASCOT_VIEW_BOX}
      fill="none"
      color={color ?? tokens.fg1}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="orbit-mascot"
      data-orbit-state={small ? state : resolveOrbitShownState(state, lookAt)}
      data-orbit-face={small ? 'small' : 'rig'}
      data-orbit-loop={running ? 'running' : 'still'}
      data-orbit-turn={turn > 0 ? 'turning' : 'rest'}
    >
      {small ? (
        <SmallFace size={size} palette={palette} clipId={clipId} />
      ) : (
        <Rig state={state} frame={frame} palette={palette} clipId={clipId} eyeOffset={eyeOffset} />
      )}
    </Svg>
  )
}

/** The AI marker where a slot takes an icon component: the small static face at the tier of the slot. */
export function OrbitMascotIcon({ size = 24, color }: Readonly<{ size?: number; color?: string; [key: string]: unknown }>) {
  return <OrbitMascot size={orbitMascotSizeFor(size)} color={color === 'currentColor' ? undefined : color} still />
}

/** The mascot size of a state surface: 96 in the compact shell, 128 at 1024 and above. */
export function useStateMascotSize(): 96 | 128 {
  return useWindowDimensions().width >= 1024 ? 128 : 96
}
