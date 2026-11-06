import { describe, expect, it } from 'vitest'
import { clampAstraButton, getAstraButtonClearance, moveAstraButton, parseAstraButtonPosition, resolveAstraButtonArea, snapAstraButton } from '../utils/astra-button-position'

const fullArea = (width: number, height: number) => ({ width, height, column: { start: 0, end: width } })

describe('Astra button placement', () => {
  it.each([320, 412, 740, 1352])('snaps to either edge at width %i while clearing create and back-to-top', width => {
    const area = fullArea(width, 600)
    const obstacles = [{ x: width - 76, y: 524, width: 60, height: 60 }, { x: 0, y: 8, width, height: 64 }]
    const resting = snapAstraButton(null, area, obstacles)!
    expect(resting).toEqual({ x: width - 76, y: 440 })
    for (const x of [16, width - 76]) {
      for (const y of [16, 120, 400, 524]) {
        const point = snapAstraButton({ x, y }, area, obstacles)!
        expect([16, width - 76]).toContain(point.x)
        expect(point.y).toBeGreaterThanOrEqual(96)
        expect(point.y + 60).toBeLessThanOrEqual(584)
        if (point.x === width - 76) expect(point.y + 60 + 24).toBeLessThanOrEqual(524)
      }
    }
  })

  it('retains valid positions and resets an outgrown device position to the default', () => {
    const saved = parseAstraButtonPosition('{"x":336,"y":200}')!
    expect(snapAstraButton(saved, fullArea(412, 600), [])).toEqual(saved)
    expect(snapAstraButton(saved, fullArea(320, 400), [])).toEqual({ x: 244, y: 240 })
    expect(snapAstraButton({ x: 16, y: 800 }, fullArea(412, 400), [])).toEqual({ x: 336, y: 240 })
    expect(clampAstraButton({ x: -200, y: 1000 }, fullArea(320, 400))).toEqual({ x: 16, y: 324 })
  })

  it('offers the same four discrete moves for keyboard and TalkBack', () => {
    const area = fullArea(412, 600)
    const point = { x: 336, y: 200 }
    expect(moveAstraButton(point, 'left', area)).toEqual({ x: 16, y: 200 })
    expect(moveAstraButton({ x: 16, y: 200 }, 'right', area)).toEqual(point)
    expect(moveAstraButton(point, 'up', area).y).toBe(124)
    expect(moveAstraButton(point, 'down', area).y).toBe(276)
  })

  it.each([null, '', 'null', '{}', '{"x":"16","y":20}', '{"x":16}', 'invalid'])('rejects invalid device storage %s', stored => {
    expect(parseAstraButtonPosition(stored)).toBeNull()
  })

  it('rests on the create FAB lane and snaps to the content column on a wide compact screen', () => {
    const area = { width: 840, height: 600, column: { start: 50, end: 790 } }
    const create = { x: 714, y: 524, width: 60, height: 60 }
    expect(snapAstraButton(null, area, [create])).toEqual({ x: 714, y: 440 })
    expect(clampAstraButton({ x: 2000, y: 200 }, area).x).toBe(764)
    expect(snapAstraButton({ x: 764, y: 200 }, area, [create])).toEqual({ x: 714, y: 200 })
    expect(snapAstraButton({ x: 16, y: 200 }, area, [create])).toEqual({ x: 66, y: 200 })
    expect(snapAstraButton({ x: 380, y: 200 }, area, [create])).toEqual({ x: 66, y: 200 })
    expect(moveAstraButton({ x: 714, y: 200 }, 'left', area)).toEqual({ x: 66, y: 200 })
    expect(moveAstraButton({ x: 66, y: 200 }, 'right', area)).toEqual({ x: 714, y: 200 })
  })

  it('withholds the control only when its container cannot fit a touch target', () => {
    expect(snapAstraButton(null, fullArea(80, 80), [])).toBeNull()
  })
})

describe('Astra button drag area', () => {
  const viewport = { top: 24, bottom: 891, width: 412 }

  it('spans the whole screen from the top safe area down to the tab bar', () => {
    const area = resolveAstraButtonArea(viewport, [787], { start: 0, end: 412 })
    expect(area).toEqual(fullArea(412, 763))
    expect(clampAstraButton({ x: 200, y: -500 }, area).y).toBe(16)
    const lowest = clampAstraButton({ x: 200, y: 5000 }, area)
    expect(viewport.top + lowest.y + 60 + 16).toBe(787)
  })

  it('stops above the highest notice or selection slot while it shows', () => {
    const area = resolveAstraButtonArea(viewport, [787, 640, 700], { start: 0, end: 412 })
    expect(area.height).toBe(616)
    expect(viewport.top + clampAstraButton({ x: 0, y: 5000 }, area).y + 60 + 16).toBe(640)
  })

  it('falls back to the viewport bottom and never reports a negative area', () => {
    expect(resolveAstraButtonArea(viewport, [], { start: 0, end: 412 })).toEqual(fullArea(412, 867))
    expect(resolveAstraButtonArea(viewport, [10], { start: 0, end: 412 })).toEqual(fullArea(412, 0))
  })

  it('reserves end-of-list clearance from the button position to the page bottom', () => {
    expect(getAstraButtonClearance({ x: 336, y: 600 }, 680)).toBe(96)
    expect(getAstraButtonClearance({ x: 336, y: 700 }, 680)).toBe(0)
    expect(getAstraButtonClearance(null, 680)).toBe(0)
  })
})
