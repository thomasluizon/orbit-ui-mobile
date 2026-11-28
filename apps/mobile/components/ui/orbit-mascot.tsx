import {
  ORBIT_MASCOT_FACES,
  ORBIT_MASCOT_PLANET_RADIUS,
  ORBIT_MASCOT_VIEW_BOX,
  ORBIT_SMALL_FACES,
  isOrbitMascotSmallSize,
  orbitBlinkMatrix,
  orbitEyeOffset,
  orbitMascotDrawnFrame,
  orbitMascotFrame,
  orbitMascotHeight,
  orbitMascotSizeFor,
  orbitOutlineCutout,
  orbitRingTurnProgress,
  orbitSmallFaceFrame,
  resolveOrbitShownState,
  type OrbitEyeShape,
  type OrbitLiveRole,
  type OrbitMascotProps,
  type OrbitMascotSmallSize,
  type OrbitSmallFaceFrame,
} from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
import {
  claimOrbitLiveSlot,
  getOrbitLoopVersion,
  isOrbitMotionEnabled,
  mayOrbitRunLoop,
  runOrbitLoopClock,
  runOrbitReadClock,
  subscribeOrbitLoop,
} from '@orbit/shared/utils'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { AppState, useWindowDimensions } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg'
import Animated, { useAnimatedProps, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useOrbitOverlay } from '@/components/ui/orbit-overlay-layer'
import { useOrbitReadMotionAllowed } from '@/components/ui/orbit-read-motion'
import { useOrbitScreenFocused } from '@/components/ui/orbit-screen-focus'

const ON_SCREEN_PROBE_MS = 250
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedG = Animated.createAnimatedComponent(G)
const REST = orbitMascotFrame(0, mascotMotion)

interface WindowMeasurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void
}

function useOnScreen(target: RefObject<WindowMeasurable | null>, active: boolean): boolean {
  const [onScreen, setOnScreen] = useState(true)
  const shown = useRef(true)
  const { width, height } = useWindowDimensions()
  useEffect(() => {
    if (!active) return undefined
    const probe = () => {
      target.current?.measureInWindow((x, y, boxWidth, boxHeight) => {
        const next = boxWidth > 0 && boxHeight > 0 && x < width && y < height && x + boxWidth > 0 && y + boxHeight > 0
        if (next === shown.current) return
        shown.current = next
        setOnScreen(next)
      })
    }
    probe()
    const timer = setInterval(probe, ON_SCREEN_PROBE_MS)
    return () => clearInterval(timer)
  }, [active, target, width, height])
  return onScreen
}

function useOrbitLoopClock(wantsLoop: boolean, role: OrbitLiveRole, target: RefObject<WindowMeasurable | null>) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const overlay = useOrbitOverlay()
  const reducedMotion = usePrefersReducedMotion()
  const screenFocused = useOrbitScreenFocused()
  const candidate = wantsLoop && !reducedMotion && screenFocused
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const onScreen = useOnScreen(target, candidate && foreground && isOrbitMotionEnabled())
  const clock = useSharedValue(0)
  const drawn = useRef(0)
  useSyncExternalStore(subscribeOrbitLoop, getOrbitLoopVersion, getOrbitLoopVersion)

  useEffect(() => (candidate && onScreen ? claimOrbitLiveSlot(claim, overlay, role) : undefined), [candidate, onScreen, claim, overlay, role])

  useEffect(() => {
    if (!candidate) return undefined
    const update = (status: string) => setForeground(status === 'active')
    update(AppState.currentState)
    const subscription = AppState.addEventListener('change', update)
    return () => subscription.remove()
  }, [candidate, claim])

  const running = candidate && onScreen && foreground && mayOrbitRunLoop(claim)

  useEffect(() => {
    clock.value = candidate ? drawn.current : 0
  }, [candidate, clock])

  useEffect(() => {
    if (!running) return undefined
    return runOrbitLoopClock(globalThis, drawn.current, (time) => {
      if (time === drawn.current) return
      drawn.current = time
      clock.value = time
    })
  }, [running, clock])

  return { clock, running }
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

interface Palette {
  readonly eye: string
  readonly moon: string
}

type AnimatedPropsOf = ReturnType<typeof useAnimatedProps>

function Eye({ shape, palette, rest, blink }: Readonly<{ shape: OrbitEyeShape; palette: Palette; rest?: string; blink?: AnimatedPropsOf }>) {
  if (shape.kind === 'fill') return <AnimatedPath d={shape.d} fill={palette.eye} transform={rest} animatedProps={blink} />
  return <Path d={shape.d} fill="none" stroke={palette.eye} strokeWidth={shape.width} strokeLinecap="round" />
}

function Planet({ viewBox, outline, outlineTransform, outlineProps, clipId, children }: Readonly<{ viewBox: string; outline: string; outlineTransform?: string; outlineProps?: AnimatedPropsOf; clipId: string; children: ReactNode }>) {
  return (
    <>
      <Defs>
        <ClipPath id={clipId}>
          <AnimatedPath d={orbitOutlineCutout(viewBox, outline)} transform={outlineTransform} clipRule="evenodd" animatedProps={outlineProps} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`} clipRule="evenodd">
        {children}
      </G>
    </>
  )
}

interface RigProps {
  readonly state: NonNullable<OrbitMascotProps['state']>
  readonly time: SharedValue<number>
  readonly turn: number
  readonly running: boolean
  readonly palette: Palette
  readonly clipId: string
  readonly eyeOffset: { readonly x: number; readonly y: number }
}

function eyesTransform(offset: { readonly x: number; readonly y: number }, widen: number) {
  'worklet'
  return `translate(${offset.x} ${offset.y})${widen === 1 ? '' : ` scale(${widen} 1)`}`
}

function Rig({ state, time, turn, running, palette, clipId, eyeOffset }: Readonly<RigProps>) {
  const face = ORBIT_MASCOT_FACES[state]
  const centreY = face.blinkCentreY
  const frame = useDerivedValue(() => orbitMascotDrawnFrame(time.value, mascotMotion, running, turn))
  const ringBack = useAnimatedProps(() => ({ d: frame.value.ringBack }))
  const ringFront = useAnimatedProps(() => ({ d: frame.value.ringFront }))
  const cutout = useAnimatedProps(() => ({ d: orbitOutlineCutout(ORBIT_MASCOT_VIEW_BOX, frame.value.ringOutline) }))
  const moonBehind = useAnimatedProps(() => ({ cx: frame.value.moon.x, cy: frame.value.moon.y, r: frame.value.moon.front ? 0 : frame.value.moon.radius }))
  const moonAhead = useAnimatedProps(() => ({ cx: frame.value.moon.x, cy: frame.value.moon.y, r: frame.value.moon.front ? frame.value.moon.radius : 0 }))
  const eyes = useAnimatedProps(() => ({ transform: eyesTransform(eyeOffset, frame.value.eyeWiden) }))
  const blink = useAnimatedProps(() => ({ transform: centreY === null ? undefined : orbitBlinkMatrix(frame.value.blinkScale, centreY) }))
  const moon = { cx: REST.moon.x, cy: REST.moon.y, fill: palette.moon }
  return (
    <>
      <AnimatedPath d={REST.ringBack} fill="currentColor" animatedProps={ringBack} />
      <AnimatedCircle {...moon} r={REST.moon.front ? 0 : REST.moon.radius} animatedProps={moonBehind} />
      <Planet viewBox={ORBIT_MASCOT_VIEW_BOX} outline={REST.ringOutline} outlineProps={cutout} clipId={clipId}>
        <Circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} fill="currentColor" />
        <AnimatedG transform={eyesTransform(eyeOffset, 1)} animatedProps={eyes}>
          {face.eyes.map((shape) => (
            <Eye key={shape.d} shape={shape} palette={palette} rest={centreY === null ? undefined : orbitBlinkMatrix(1, centreY)} blink={blink} />
          ))}
        </AnimatedG>
      </Planet>
      <AnimatedPath d={REST.ringFront} fill="currentColor" animatedProps={ringFront} />
      <AnimatedCircle {...moon} r={REST.moon.front ? REST.moon.radius : 0} animatedProps={moonAhead} />
    </>
  )
}

function SmallFace({ size, palette, clipId, motion }: Readonly<{ size: OrbitMascotSmallSize; palette: Palette; clipId: string; motion?: OrbitSmallFaceFrame }>) {
  const face = ORBIT_SMALL_FACES[size]
  const moon = <Path d={face.moon} transform={motion?.moon} fill={palette.moon} data-part="moon" />
  const moonFront = motion?.moonFront ?? true
  return (
    <>
      <Path d={face.ringBack} transform={motion?.ring} fill="currentColor" />
      {moonFront ? null : moon}
      <Planet viewBox={face.viewBox} outline={face.ringOutline} outlineTransform={motion?.ring} clipId={clipId}>
        <Path d={face.planet} fill="currentColor" />
        {face.eyes.map((eye) => (
          <Path key={eye} d={eye} transform={motion?.eyes} fill={palette.eye} data-part="eye" />
        ))}
      </Planet>
      <Path d={face.ringFront} transform={motion?.ring} fill="currentColor" />
      {moonFront ? moon : null}
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

function OrbitMascotDrawing({ size, state = 'parado', still = false, reading = false, color, live = 'single', lookAt = null, turnKey, tokens }: Readonly<OrbitMascotProps & { tokens: AppTokensV2 }>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const svgRef = useRef<Svg | null>(null)
  const small = isOrbitMascotSmallSize(size)
  const { clock, running: looping } = useOrbitLoopClock(!small && !still, live, svgRef)
  const reducedMotion = usePrefersReducedMotion()
  const turn = useRingTurn(turnKey, !small && !still && !reducedMotion)
  const read = useOrbitReadClock(small && reading)
  const smallMotion = small && read.running ? orbitSmallFaceFrame(read.clock, size, mascotMotion) : undefined
  const running = looping || read.running
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
        <SmallFace size={size} palette={palette} clipId={clipId} motion={smallMotion} />
      ) : (
        <Rig state={state} time={clock} turn={turn} running={looping} palette={palette} clipId={clipId} eyeOffset={eyeOffset} />
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
