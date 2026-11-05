import { describe, expect, it } from 'vitest'
import { clampAstraButton, moveAstraButton, parseAstraButtonPosition, snapAstraButton } from '../utils/astra-button-position'

describe('Astra button placement', () => {
  it.each([320, 412, 740, 1352])('snaps to either edge at width %i while clearing create and back-to-top', width => {
    const area = { width, height: 600 }
    const obstacles = [{ x: width - 76, y: 524, width: 60, height: 60 }, { x: 0, y: 8, width, height: 64 }]
    const resting = snapAstraButton(null, area, obstacles)!
    expect(resting).toEqual({ x: width - 76, y: 448 })
    for (const x of [16, width - 76]) {
      for (const y of [16, 120, 400, 524]) {
        const point = snapAstraButton({ x, y }, area, obstacles)!
        expect([16, width - 76]).toContain(point.x)
        expect(point.y).toBeGreaterThanOrEqual(88)
        expect(point.y + 60).toBeLessThanOrEqual(584)
        if (point.x === width - 76) expect(point.y + 60 + 16).toBeLessThanOrEqual(524)
      }
    }
  })

  it('retains valid positions and resets an outgrown device position to the default', () => {
    const saved = parseAstraButtonPosition('{"x":336,"y":200}')!
    expect(snapAstraButton(saved, { width: 412, height: 600 }, [])).toEqual(saved)
    expect(snapAstraButton(saved, { width: 320, height: 400 }, [])).toEqual({ x: 244, y: 248 })
    expect(snapAstraButton({ x: 16, y: 800 }, { width: 412, height: 400 }, [])).toEqual({ x: 336, y: 248 })
    expect(clampAstraButton({ x: -200, y: 1000 }, { width: 320, height: 400 })).toEqual({ x: 16, y: 324 })
  })

  it('offers the same four discrete moves for keyboard and TalkBack', () => {
    const area = { width: 412, height: 600 }
    const point = { x: 336, y: 200 }
    expect(moveAstraButton(point, 'left', area)).toEqual({ x: 16, y: 200 })
    expect(moveAstraButton({ x: 16, y: 200 }, 'right', area)).toEqual(point)
    expect(moveAstraButton(point, 'up', area).y).toBe(124)
    expect(moveAstraButton(point, 'down', area).y).toBe(276)
  })

  it.each([null, '', 'null', '{}', '{"x":"16","y":20}', '{"x":16}', 'invalid'])('rejects invalid device storage %s', stored => {
    expect(parseAstraButtonPosition(stored)).toBeNull()
  })

  it('withholds the control only when its container cannot fit a touch target', () => {
    expect(snapAstraButton(null, { width: 80, height: 80 }, [])).toBeNull()
  })
})
