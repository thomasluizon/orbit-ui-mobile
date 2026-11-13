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
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, useWindowDimensions } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'

const SMALL_BOX_RATIO = 3 / 4
const LIVE_MIN_SIZE = 48
const MAX_FRAME_STEP_MS = 100

function isSmallSize(size: number): size is OrbitMascotSmallSize {
  return size < LIVE_MIN_SIZE
}

/** The idle loop clock in milliseconds. It runs only while this mascot holds the one live slot, the
 *  person has not paused Orbit, no overlay covers its layer and the app is in the foreground. It never
 *  runs under reduced motion. */
function useOrbitLoopClock(wantsLoop: boolean) {
  const [claim] = useState(() => Symbol('orbit-mascot'))
  const layer = useOrbitOverlayLayer()
  const reducedMotion = useReducedMotion()
  const candidate = wantsLoop && !reducedMotion
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [clock, setClock] = useState(0)
  const elapsed = useRef(0)
  useSyncExternalStore(subscribeOrbitLoop, getOrbitLoopVersion, getOrbitLoopVersion)

  useEffect(() => (candidate ? claimOrbitLiveSlot(claim, layer) : undefined), [candidate, claim, layer])

  useEffect(() => {
    if (!candidate) return undefined
    const subscription = AppState.addEventListener('change', (next) => setForeground(next === 'active'))
    return () => subscription.remove()
  }, [candidate, claim])

  const running = candidate && foreground && mayOrbitRunLoop(claim)

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

interface Palette {
  readonly eye: string
  readonly surface: string
  readonly moon: string
}

function Eye({ shape, palette, blink }: Readonly<{ shape: OrbitEyeShape; palette: Palette; blink?: string }>) {
  if (shape.kind === 'fill') return <Path d={shape.d} fill={palette.eye} transform={blink} />
  return <Path d={shape.d} fill="none" stroke={palette.eye} strokeWidth={shape.width} strokeLinecap="round" />
}

function Moon({ frame, palette }: Readonly<{ frame: OrbitMascotFrame; palette: Palette }>) {
  return <Circle cx={frame.moon.x} cy={frame.moon.y} r={frame.moon.radius} fill={palette.moon} />
}

function Rig({ state, frame, palette, clipId }: Readonly<{ state: NonNullable<OrbitMascotProps['state']>; frame: OrbitMascotFrame; palette: Palette; clipId: string }>) {
  const face = ORBIT_MASCOT_FACES[state]
  const blink = face.blinkCentreY === null ? undefined : orbitBlinkMatrix(frame.blinkScale, face.blinkCentreY)
  return (
    <>
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} />
        </ClipPath>
      </Defs>
      <Path d={frame.ringBack} fill="currentColor" />
      {frame.moon.front ? null : <Moon frame={frame} palette={palette} />}
      <Circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} fill="currentColor" />
      {face.eyes.map((shape) => (
        <Eye key={shape.d} shape={shape} palette={palette} blink={blink} />
      ))}
      <G clipPath={`url(#${clipId})`}>
        <Path d={frame.ringOutline} fill={palette.surface} />
      </G>
      <Path d={frame.ringFront} fill="currentColor" />
      {frame.moon.front ? <Moon frame={frame} palette={palette} /> : null}
    </>
  )
}

function SmallFace({ size, palette, clipId }: Readonly<{ size: OrbitMascotSmallSize; palette: Palette; clipId: string }>) {
  const face = ORBIT_SMALL_FACES[size]
  return (
    <>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={face.planet} />
        </ClipPath>
      </Defs>
      <Path d={face.ringBack} fill="currentColor" />
      <Path d={face.planet} fill="currentColor" />
      {face.eyes.map((eye) => (
        <Path key={eye} d={eye} fill={palette.eye} />
      ))}
      <G clipPath={`url(#${clipId})`}>
        <Path d={face.ringOutline} fill={palette.surface} />
      </G>
      <Path d={face.ringFront} fill="currentColor" />
      <Path d={face.moon} fill={palette.moon} />
    </>
  )
}

function paletteFrom(tokens: AppTokensV2): Palette {
  return { eye: tokens.bg, surface: tokens.bg, moon: tokens.primary }
}

type MobileOrbitMascotProps = OrbitMascotProps & {
  /** The resolved tokens of a surface that must render without theme state, such as the root error screen. */
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

function OrbitMascotDrawing({ size, state = 'parado', still = false, color, tokens }: Readonly<OrbitMascotProps & { tokens: AppTokensV2 }>) {
  const clipId = `orbit-planet-${useId().replaceAll(':', '')}`
  const small = isSmallSize(size)
  const { clock, running } = useOrbitLoopClock(!small && !still)
  const frame = orbitMascotFrame(clock, mascotMotion)
  const palette = paletteFrom(tokens)

  return (
    <Svg
      width={size}
      height={small ? size * SMALL_BOX_RATIO : (size * ORBIT_MASCOT_BOX_HEIGHT) / ORBIT_MASCOT_BOX_WIDTH}
      viewBox={small ? ORBIT_SMALL_FACES[size].viewBox : ORBIT_MASCOT_VIEW_BOX}
      fill="none"
      color={color ?? tokens.fg1}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="orbit-mascot"
      data-orbit-state={state}
      data-orbit-face={small ? 'small' : 'rig'}
      data-orbit-loop={running ? 'running' : 'still'}
    >
      {small ? (
        <SmallFace size={size} palette={palette} clipId={clipId} />
      ) : (
        <Rig state={state} frame={frame} palette={palette} clipId={clipId} />
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
