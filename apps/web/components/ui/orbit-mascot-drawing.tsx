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
  type OrbitSmallFaceFrame,
} from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'


const ORBIT_REST_FRAME = orbitMascotFrame(0, mascotMotion)

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

function Planet({ viewBox, outline, outlineTransform, clipId, children }: Readonly<{ viewBox: string; outline: string; outlineTransform?: string; clipId: string; children: React.ReactNode }>) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={orbitOutlineCutout(viewBox, outline)} transform={outlineTransform} clipRule="evenodd" data-part="outline-cutout" />
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
      <path d={frame.ringBack} fill="currentColor" data-part="ring-back" />
      {frame.moon.front ? null : <Moon frame={frame} />}
      <Planet viewBox={ORBIT_MASCOT_VIEW_BOX} outline={frame.ringOutline} clipId={clipId}>
        <circle cx="0" cy="0" r={ORBIT_MASCOT_PLANET_RADIUS} fill="currentColor" />
        <g transform={`translate(${eyeOffset.x} ${eyeOffset.y})${frame.eyeWiden === 1 ? '' : ` scale(${frame.eyeWiden} 1)`}`} data-part="eyes">
          {face.eyes.map((shape) => (
            <Eye key={shape.d} shape={shape} blink={blink} />
          ))}
        </g>
      </Planet>
      <path d={frame.ringFront} fill="currentColor" data-part="ring-front" />
      {frame.moon.front ? <Moon frame={frame} /> : null}
    </>
  )
}

function SmallFace({ size, clipId, motion }: Readonly<{ size: OrbitMascotSmallSize; clipId: string; motion?: OrbitSmallFaceFrame }>) {
  const face = ORBIT_SMALL_FACES[size]
  const moon = <path d={face.moon} transform={motion?.moon} fill="var(--primary)" data-part="moon" />
  const moonFront = motion?.moonFront ?? true
  return (
    <>
      <path d={face.ringBack} transform={motion?.ring} fill="currentColor" data-part="ring-back" />
      {moonFront ? null : moon}
      <Planet viewBox={face.viewBox} outline={face.ringOutline} outlineTransform={motion?.ring} clipId={clipId}>
        <path d={face.planet} fill="currentColor" />
        {face.eyes.map((eye) => (
          <path key={eye} d={eye} transform={motion?.eyes} fill="var(--bg)" data-part="eye" />
        ))}
      </Planet>
      <path d={face.ringFront} transform={motion?.ring} fill="currentColor" data-part="ring-front" />
      {moonFront ? moon : null}
    </>
  )
}

interface OrbitMascotDrawingProps extends Pick<OrbitMascotProps, 'size' | 'color'> {
  readonly state?: NonNullable<OrbitMascotProps['state']>
  readonly clipId: string
  readonly frame?: OrbitMascotFrame
  readonly smallMotion?: OrbitSmallFaceFrame
  readonly running?: boolean
  readonly shownState?: OrbitShownState
  readonly turning?: boolean
  readonly eyeOffset?: { readonly x: number; readonly y: number }
  readonly ref?: React.Ref<SVGSVGElement>
}

export function OrbitMascotDrawing({ size, state = 'parado', shownState = state, color, clipId, frame = ORBIT_REST_FRAME, smallMotion, running = false, turning = false, eyeOffset = ORBIT_EYES_AT_REST, ref }: Readonly<OrbitMascotDrawingProps>) {
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
      {small ? <SmallFace size={size} clipId={clipId} motion={smallMotion} /> : <Rig state={state} frame={frame} clipId={clipId} eyeOffset={eyeOffset} />}
    </svg>
  )
}
