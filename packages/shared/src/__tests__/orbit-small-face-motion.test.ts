import { describe, expect, it } from 'vitest'
import {
  ORBIT_MASCOT_SMALL_SIZES,
  ORBIT_SMALL_FACES,
  ORBIT_SMALL_FACE_EYE_CENTRE_Y,
  orbitSmallFaceFrame,
} from '../contracts/brand'
import { mascotMotion } from '../theme/motion'

const IDENTITY = 'matrix(1 0 0 1 0 0)'

function matrixOf(transform: string): number[] {
  return /^matrix\((.+)\)$/.exec(transform)![1]!.split(' ').map(Number)
}

function apply(transform: string, x: number, y: number): [number, number] {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = matrixOf(transform)
  return [a * x + c * y + e, b * x + d * y + f]
}

function pathBounds(path: string) {
  const numbers = path.match(/-?[\d.]+/g)!.map(Number)
  const ys = numbers.filter((_value, index) => index % 2 === 1)
  return { top: Math.min(...ys), bottom: Math.max(...ys) }
}

describe.each([...ORBIT_MASCOT_SMALL_SIZES])('the %i px small face read motion', (size) => {
  const frameAt = (milliseconds: number) => orbitSmallFaceFrame(milliseconds, size, mascotMotion)

  it('starts at the drawn face', () => {
    expect(frameAt(0)).toEqual({ ring: IDENTITY, moon: IDENTITY, moonFront: true, eyes: IDENTITY })
  })

  it('blinks at once, about the middle of the pill eyes', () => {
    const scales = Array.from({ length: 12 }, (_value, index) => matrixOf(frameAt(index * mascotMotion.frameInterval).eyes)[3]!)
    expect(Math.min(...scales)).toBeLessThan(0.3)
    const eyes = ORBIT_SMALL_FACES[size].eyes.map(pathBounds)
    expect(ORBIT_SMALL_FACE_EYE_CENTRE_Y[size]).toBe((eyes[0]!.top + eyes[0]!.bottom) / 2)
    const closed = frameAt(mascotMotion.blinkInterval * 0.04).eyes
    expect(apply(closed, 0, ORBIT_SMALL_FACE_EYE_CENTRE_Y[size])[1]).toBeCloseTo(ORBIT_SMALL_FACE_EYE_CENTRE_Y[size], 3)
    expect(matrixOf(frameAt(mascotMotion.blinkInterval * 0.5).eyes)[3]).toBe(1)
  })

  it('takes the moon once round the ring in one ring turn, behind the planet on the far side', () => {
    const steps = Array.from({ length: 30 }, (_value, index) => frameAt((index * mascotMotion.ringTurn) / 30))
    expect(steps.some((frame) => !frame.moonFront)).toBe(true)
    expect(steps.some((frame) => frame.moonFront && frame.moon !== IDENTITY)).toBe(true)
    const [x = 0, y = 0] = matrixOf(frameAt(mascotMotion.ringTurn).moon).slice(4)
    expect(Math.hypot(x, y)).toBeLessThan(1)
    const farthest = Math.max(...steps.map((frame) => Math.hypot(...matrixOf(frame.moon).slice(4) as [number, number])))
    expect(farthest).toBeGreaterThan(size / 2)
    expect(farthest).toBeLessThan(size)
  })

  it('tilts the ring at most 5 degrees about the planet centre, which stays put', () => {
    const centre: [number, number] = [size / 2, (size * 3) / 8]
    for (let milliseconds = 0; milliseconds <= mascotMotion.tiltPeriod; milliseconds += mascotMotion.tiltPeriod / 24) {
      const ring = frameAt(milliseconds).ring
      const [cos = 1, sin = 0] = matrixOf(ring)
      expect(Math.abs((Math.atan2(sin, cos) * 180) / Math.PI)).toBeLessThanOrEqual(5.01)
      const moved = apply(ring, ...centre)
      expect(moved[0]).toBeCloseTo(centre[0], 1)
      expect(moved[1]).toBeCloseTo(centre[1], 1)
    }
  })
})
