import { describe, expect, it } from 'vitest'
import { ORBIT_MASCOT_TURN_EYE_WIDEN, orbitMascotFrame, orbitRingTurnProgress } from '../contracts/brand'
import { mascotMotion } from '../theme'

describe('the ring turn', () => {
  it('eases from 0 to 1 over the duration', () => {
    expect(orbitRingTurnProgress(0, 900)).toBe(0)
    expect(orbitRingTurnProgress(450, 900)).toBeCloseTo(0.5)
    expect(orbitRingTurnProgress(900, 900)).toBe(1)
    expect(orbitRingTurnProgress(5000, 900)).toBe(1)
  })

  it('draws the rest frame at turn 0 and again after one full turn', () => {
    const rest = orbitMascotFrame(0, mascotMotion)
    const full = orbitMascotFrame(0, mascotMotion, 1)
    expect(rest.eyeWiden).toBe(1)
    expect(full.moon.x).toBeCloseTo(rest.moon.x, 0)
    expect(full.moon.y).toBeCloseTo(rest.moon.y, 0)
  })

  it('moves the ring and widens the eyes through the middle of the turn', () => {
    const rest = orbitMascotFrame(0, mascotMotion)
    const middle = orbitMascotFrame(0, mascotMotion, 0.5)
    expect(middle.ringFront).not.toBe(rest.ringFront)
    expect(middle.eyeWiden).toBeCloseTo(ORBIT_MASCOT_TURN_EYE_WIDEN, 2)
  })
})
