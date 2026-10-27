import { describe, expect, it } from 'vitest'
import { ASTRA_GLYPH_PATHS, ASTRA_GLYPH_VIEW_BOX } from '../contracts/brand'

function cubicAt(start: number, first: number, second: number, end: number, time: number) {
  const remaining = 1 - time
  return remaining ** 3 * start + 3 * remaining ** 2 * time * first
    + 3 * remaining * time ** 2 * second + time ** 3 * end
}

function cubicBounds(start: number, first: number, second: number, end: number) {
  const quadratic = -start + 3 * first - 3 * second + end
  const linear = 2 * (start - 2 * first + second)
  const constant = first - start
  const discriminant = linear ** 2 - 4 * quadratic * constant
  const roots = Math.abs(quadratic) < 1e-10
    ? (Math.abs(linear) < 1e-10 ? [] : [-constant / linear])
    : (discriminant < 0 ? [] : [
      (-linear + Math.sqrt(discriminant)) / (2 * quadratic),
      (-linear - Math.sqrt(discriminant)) / (2 * quadratic),
    ])
  return [start, end, ...roots.filter(time => time > 0 && time < 1)
    .map(time => cubicAt(start, first, second, end, time))]
}

function drawnCoordinates(path: string) {
  const commands = [...path.matchAll(/([MLCZ])([^MLCZ]*)/g)]
  expect(commands.map(command => command[0]).join('')).toBe(path)
  const horizontal: number[] = []
  const vertical: number[] = []
  let currentX = 0
  let currentY = 0
  for (const [, command, argumentsText] of commands) {
    const coordinates = argumentsText!.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    expect(coordinates.every(Number.isFinite)).toBe(true)
    if (command === 'Z') {
      expect(coordinates).toHaveLength(0)
      continue
    }
    expect(coordinates).toHaveLength(command === 'C' ? 6 : 2)
    if (command === 'C') {
      horizontal.push(...cubicBounds(currentX, coordinates[0]!, coordinates[2]!, coordinates[4]!))
      vertical.push(...cubicBounds(currentY, coordinates[1]!, coordinates[3]!, coordinates[5]!))
    } else {
      horizontal.push(coordinates[0]!)
      vertical.push(coordinates[1]!)
    }
    currentX = coordinates.at(-2)!
    currentY = coordinates.at(-1)!
  }
  return { horizontal, vertical }
}

describe('Astra glyph frame', () => {
  it('contains every drawn coordinate and touches all four edges of its view box', () => {
    const frame = ASTRA_GLYPH_VIEW_BOX.split(/\s+/).map(Number)
    expect(frame).toHaveLength(4)
    expect(frame.every(Number.isFinite)).toBe(true)
    const [left, top, width, height] = frame as [number, number, number, number]
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    expect(ASTRA_GLYPH_PATHS.length).toBeGreaterThan(0)
    const paths = ASTRA_GLYPH_PATHS.map(path => drawnCoordinates(path.d))
    const axes = [
      { coordinates: paths.flatMap(path => path.horizontal), minimum: left, maximum: left + width },
      { coordinates: paths.flatMap(path => path.vertical), minimum: top, maximum: top + height },
    ]
    for (const { coordinates, minimum, maximum } of axes) {
      for (const coordinate of coordinates) {
        expect(coordinate).toBeGreaterThanOrEqual(minimum - 0.01)
        expect(coordinate).toBeLessThanOrEqual(maximum + 0.01)
      }
      expect(Math.abs(Math.min(...coordinates) - minimum)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(Math.max(...coordinates) - maximum)).toBeLessThanOrEqual(0.01)
    }
  })
})
