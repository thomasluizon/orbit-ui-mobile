import { describe, expect, it } from 'vitest'
import { steadyColumnInset } from '../utils/steady-column'

describe('steadyColumnInset', () => {
  it.each([
    { viewport: 647, column: 500, block: 0, inset: 0 },
    { viewport: 647, column: 589, block: 89, inset: 73.5 },
    { viewport: 647, column: 600, block: 21, inset: 21 },
    { viewport: 647, column: 700, block: 89, inset: 18 },
    { viewport: 412, column: 700, block: 89, inset: 0 },
    { viewport: 0, column: 0, block: 0, inset: 0 },
  ])('pads $inset above a $column column holding a $block check in a $viewport viewport', ({ viewport, column, block, inset }) => {
    expect(steadyColumnInset({ viewport, column, block })).toBe(inset)
  })
})
