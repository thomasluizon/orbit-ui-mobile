import { describe, expect, it } from 'vitest'
import { nearestSnapHeight, offsetFor, resolveSnapHeights } from '@/lib/bottom-sheet-snap'

const SCREEN = 900
const MAX = 820

describe('resolveSnapHeights', () => {
  it('converts percentage strings to pixel heights against the screen', () => {
    expect(resolveSnapHeights(['50%'], SCREEN, MAX)).toEqual([450])
  })

  it('passes raw numbers through untouched when within the cap', () => {
    expect(resolveSnapHeights([320], SCREEN, MAX)).toEqual([320])
  })

  it('sorts the resolved heights ascending regardless of input order', () => {
    expect(resolveSnapHeights(['95%', '80%'], SCREEN, MAX)).toEqual([720, 820])
  })

  it('clamps any height above the cap down to the cap', () => {
    expect(resolveSnapHeights(['95%'], SCREEN, MAX)).toEqual([MAX])
  })

  it('dedupes heights that collapse to the same pixel value after clamping', () => {
    expect(resolveSnapHeights(['95%', '99%'], SCREEN, MAX)).toEqual([MAX])
  })

  it('handles a single snap point', () => {
    expect(resolveSnapHeights(['55%'], SCREEN, MAX)).toEqual([495])
  })

  it('mixes percentages and raw numbers, sorted and clamped', () => {
    expect(resolveSnapHeights(['90%', 200, '99%'], SCREEN, MAX)).toEqual([200, 810, MAX])
  })

  it('falls back to a single capped snap when given no snap points', () => {
    expect(resolveSnapHeights([], SCREEN, MAX)).toEqual([MAX])
  })
})

describe('offsetFor', () => {
  it('returns the gap between the cap and the target height', () => {
    expect(offsetFor(450, MAX)).toBe(MAX - 450)
  })

  it('returns zero when the sheet fills the cap', () => {
    expect(offsetFor(MAX, MAX)).toBe(0)
  })
})

describe('nearestSnapHeight', () => {
  const snaps = [400, 600, 800]

  it('snaps to the closest height on a slow release', () => {
    expect(nearestSnapHeight(snaps, 560, 0)).toBe(600)
    expect(nearestSnapHeight(snaps, 460, 0)).toBe(400)
  })

  it('biases to the next shorter snap on a fast downward fling', () => {
    expect(nearestSnapHeight(snaps, 590, 2)).toBe(400)
  })

  it('biases to the next taller snap on a fast upward fling', () => {
    expect(nearestSnapHeight(snaps, 610, -2)).toBe(800)
  })

  it('stays at the extreme snap when a fling has nowhere further to go', () => {
    expect(nearestSnapHeight(snaps, 800, -2)).toBe(800)
    expect(nearestSnapHeight(snaps, 400, 2)).toBe(400)
  })

  it('returns the only snap for single-snap sheets', () => {
    expect(nearestSnapHeight([500], 500, 0)).toBe(500)
  })
})
