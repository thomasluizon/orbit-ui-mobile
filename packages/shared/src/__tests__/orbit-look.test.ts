import { describe, expect, it } from 'vitest'
import { orbitEyeOffset, orbitLookVector, resolveOrbitShownState, ORBIT_EYE_TRAVEL } from '../contracts/brand'

describe('orbit look', () => {
  it('shows Olhando only over parado', () => {
    const target = { x: 1, y: 0 }
    expect(resolveOrbitShownState('parado', target)).toBe('olhando')
    expect(resolveOrbitShownState('parado', null)).toBe('parado')
    expect(resolveOrbitShownState('pensando', target)).toBe('pensando')
    expect(resolveOrbitShownState('feliz', target)).toBe('feliz')
    expect(resolveOrbitShownState('descansando', target)).toBe('descansando')
  })

  it('moves the eyes toward the target and clamps the travel', () => {
    expect(orbitEyeOffset({ x: 1, y: -1 }, false)).toEqual({ x: ORBIT_EYE_TRAVEL.x, y: -ORBIT_EYE_TRAVEL.y })
    expect(orbitEyeOffset({ x: 9, y: 9 }, false)).toEqual({ x: ORBIT_EYE_TRAVEL.x, y: ORBIT_EYE_TRAVEL.y })
  })

  it('draws no eye travel under reduced motion', () => {
    expect(orbitEyeOffset({ x: 1, y: 1 }, true)).toEqual({ x: 0, y: 0 })
  })

  it('builds a look vector from the mascot to a control', () => {
    expect(orbitLookVector({ x: 100, y: 100 }, { x: 100, y: 260 })).toEqual({ x: 0, y: 1 })
    expect(orbitLookVector({ x: 100, y: 100 }, { x: 20, y: 100 })).toEqual({ x: -0.5, y: 0 })
  })
})
