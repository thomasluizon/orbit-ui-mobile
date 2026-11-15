import {
  ORBIT_MASCOT_FACES,
  ORBIT_MASCOT_PLANET_RADIUS,
  ORBIT_MASCOT_VIEW_BOX,
  ORBIT_SMALL_FACES,
  isOrbitMascotSmallSize,
  orbitBlinkMatrix,
  orbitMascotFrame,
  orbitMascotHeight,
  orbitOutlineCutout,
  type OrbitEyeShape,
  type OrbitMascotFrame,
  type OrbitMascotProps,
  type OrbitMascotSmallSize,
  type OrbitShownState,
} from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'

/** The Orbit drawing, with no hooks and no client directive, so a page the server renders on its own (the desktop
 *  sign-in completion page) can draw it. `OrbitMascot` runs the idle loop and draws each frame through it. */

/** Zero is the rest frame every still face draws, with the eyes open. */
const ORBIT_REST_FRAME = orbitMascotFrame(0, mascotMotion)

/** The eyes at rest: no travel toward a control. */
const ORBIT_EYES_AT_REST = { x: 0, y: 0 } as const

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

/** The planet and its eyes, clipped by the ring outline cut-out, so the outline shows whatever surface is behind the mascot. */
function Planet({ viewBox, outline, clipId, children }: Readonly<{ viewBox: string; outline: string; clipId: string; children: React.ReactNode }>) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={orbitOutlineCutout(viewBox, outline)} clipRule="evenodd" data-part="outline-cutout" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} clipRule="evenodd" data-part="planet">
        {children}
      </g>
    </>
  )
}

function Rig({ state, frame, clipId, eyeOffset }: Readonly<{ state: NonNullable<OrbitMascotProps['state']>; frame: OrbitMascotFrame; clipId: string; eyeOffset: { readonly x: number; readonly y: number } }>) {
  const face = ORBIT_MASCOT_FACES[state]
  const blink = face.blinkCentreY === null ? undefined : orbitBlinkMatrix(frame.blinkScale, face.blinkCentreY)
  return (
    <>
      <path d={frame.ringBack} fill="currentColor" />
      {frame.moon.front ? null : <Moon frame={frame} />}
      <Planet viewBox={ORBIT_MASCOT_VIEW_BOX} outline={frame.ringOutline} clipId={clipId}>
        <circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} fill="currentColor" />
        <g transform={`translate(${eyeOffset.x} ${eyeOffset.y})${frame.eyeWiden === 1 ? '' : ` scale(${frame.eyeWiden} 1)`}`} data-part="eyes">
          {face.eyes.map((shape) => (
            <Eye key={shape.d} shape={shape} blink={blink} />
          ))}
        </g>
      </Planet>
      <path d={frame.ringFront} fill="currentColor" />
      {frame.moon.front ? <Moon frame={frame} /> : null}
    </>
  )
}

function SmallFace({ size, clipId }: Readonly<{ size: OrbitMascotSmallSize; clipId: string }>) {
  const face = ORBIT_SMALL_FACES[size]
  return (
    <>
      <path d={face.ringBack} fill="currentColor" />
      <Planet viewBox={face.viewBox} outline={face.ringOutline} clipId={clipId}>
        <path d={face.planet} fill="currentColor" />
        {face.eyes.map((eye) => (
          <path key={eye} d={eye} fill="var(--bg)" data-part="eye" />
        ))}
      </Planet>
      <path d={face.ringFront} fill="currentColor" />
      <path d={face.moon} fill="var(--primary)" data-part="moon" />
    </>
  )
}

interface OrbitMascotDrawingProps extends Pick<OrbitMascotProps, 'size' | 'color'> {
  readonly state?: NonNullable<OrbitMascotProps['state']>
  /** The planet clip id. It must be unique in the document. */
  readonly clipId: string
  /** The loop frame to draw. A still Orbit draws the rest frame. */
  readonly frame?: OrbitMascotFrame
  readonly running?: boolean
  /** The state `data-orbit-state` exposes, such as olhando while Orbit looks at a control. It defaults to `state`. */
  readonly shownState?: OrbitShownState
  /** True while a ring turn draws. */
  readonly turning?: boolean
  /** The eye shift toward the control in focus, in rig units. */
  readonly eyeOffset?: { readonly x: number; readonly y: number }
  readonly ref?: React.Ref<SVGSVGElement>
}

export function OrbitMascotDrawing({ size, state = 'parado', shownState = state, color, clipId, frame = ORBIT_REST_FRAME, running = false, turning = false, eyeOffset = ORBIT_EYES_AT_REST, ref }: Readonly<OrbitMascotDrawingProps>) {
  const small = isOrbitMascotSmallSize(size)
  return (
    <svg
      ref={ref}
      width={size}
      height={orbitMascotHeight(size)}
      viewBox={small ? ORBIT_SMALL_FACES[size].viewBox : ORBIT_MASCOT_VIEW_BOX}
      fill="none"
      color={color ?? 'var(--fg-1)'}
      aria-hidden="true"
      data-asset="orbit-mascot"
      data-orbit-state={shownState}
      data-orbit-face={small ? 'small' : 'rig'}
      data-orbit-loop={running ? 'running' : 'still'}
      data-orbit-turn={turning ? 'turning' : 'rest'}
    >
      {small ? <SmallFace size={size} clipId={clipId} /> : <Rig state={state} frame={frame} clipId={clipId} eyeOffset={eyeOffset} />}
    </svg>
  )
}
