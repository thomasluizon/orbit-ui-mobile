import { describe, expect, it } from 'vitest'
import {
  ORBIT_MASCOT_SMALL_SIZES,
  ORBIT_SMALL_FACES,
  ORBIT_SMALL_FACE_EYE_CENTRE_Y,
  ORBIT_SMALL_FACE_MOON,
  orbitSmallFaceFrame,
} from '../contracts/brand'
import { mascotMotion } from '../theme/motion'

const IDENTITY = 'matrix(1 0 0 1 0 0)'
const MATRIX_ROUNDING = 0.0005

function matrixOf(transform: string): number[] {
  return /^matrix\((.+)\)$/.exec(transform)![1]!.split(' ').map(Number)
}

function apply(transform: string, x: number, y: number): [number, number] {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = matrixOf(transform)
  return [a * x + c * y + e, b * x + d * y + f]
}

function pathPoints(path: string): [number, number][] {
  const numbers = path.match(/-?[\d.]+/g)!.map(Number)
  return numbers.flatMap((value, index) => (index % 2 === 0 ? [[value, numbers[index + 1]!] as [number, number]] : []))
}

function pathBounds(path: string) {
  const points = pathPoints(path)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}

function drawnMoon(size: (typeof ORBIT_MASCOT_SMALL_SIZES)[number]) {
  const bounds = pathBounds(ORBIT_SMALL_FACES[size].moon)
  return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2, radius: (bounds.right - bounds.left) / 2 }
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

  it('keeps the whole moon inside the drawing box and on the drawn ring at every frame', () => {
    const moon = drawnMoon(size)
    expect(ORBIT_SMALL_FACE_MOON[size]).toEqual(moon)
    const [, , width = 0, height = 0] = ORBIT_SMALL_FACES[size].viewBox.split(' ').map(Number)
    const ring = [...pathPoints(ORBIT_SMALL_FACES[size].ringBack), ...pathPoints(ORBIT_SMALL_FACES[size].ringFront)]
    let left = width
    let right = 0
    for (let milliseconds = 0; milliseconds <= mascotMotion.tiltPeriod * 2; milliseconds += 3) {
      const frame = frameAt(milliseconds)
      const [x, y] = apply(frame.moon, moon.x, moon.y)
      left = Math.min(left, x - moon.radius)
      right = Math.max(right, x + moon.radius)
      expect(x - moon.radius, `left edge at ${milliseconds} ms`).toBeGreaterThanOrEqual(-MATRIX_ROUNDING)
      expect(x + moon.radius, `right edge at ${milliseconds} ms`).toBeLessThanOrEqual(width + MATRIX_ROUNDING)
      expect(y - moon.radius, `top edge at ${milliseconds} ms`).toBeGreaterThanOrEqual(-MATRIX_ROUNDING)
      expect(y + moon.radius, `bottom edge at ${milliseconds} ms`).toBeLessThanOrEqual(height + MATRIX_ROUNDING)
      const nearest = Math.min(...ring.map((point) => Math.hypot(...apply(frame.ring, ...point).map((value, index) => value - [x, y][index]!) as [number, number])))
      expect(nearest, `distance to the ring at ${milliseconds} ms`).toBeLessThanOrEqual(moon.radius)
    }
    expect(left).toBeLessThan(0.1)
    expect(width - right).toBeLessThan(0.1)
  })

  it('keeps the whole tilted ring inside the drawing box at every frame', () => {
    const [, , width = 0, height = 0] = ORBIT_SMALL_FACES[size].viewBox.split(' ').map(Number)
    const face = ORBIT_SMALL_FACES[size]
    const ring = [...pathPoints(face.ringBack), ...pathPoints(face.ringFront), ...pathPoints(face.ringOutline)]
    const rounding = MATRIX_ROUNDING * (width + height + 1)
    for (let milliseconds = 0; milliseconds <= mascotMotion.tiltPeriod; milliseconds += 10) {
      const turned = ring.map((point) => apply(frameAt(milliseconds).ring, ...point))
      expect(Math.min(...turned.map(([x]) => x)), `left edge at ${milliseconds} ms`).toBeGreaterThanOrEqual(-rounding)
      expect(Math.max(...turned.map(([x]) => x)), `right edge at ${milliseconds} ms`).toBeLessThanOrEqual(width + rounding)
      expect(Math.min(...turned.map(([, y]) => y)), `top edge at ${milliseconds} ms`).toBeGreaterThanOrEqual(-rounding)
      expect(Math.max(...turned.map(([, y]) => y)), `bottom edge at ${milliseconds} ms`).toBeLessThanOrEqual(height + rounding)
    }
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
