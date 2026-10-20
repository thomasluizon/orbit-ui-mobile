import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CALENDAR_GRID_GAP_CONTENT_BREAKPOINT, CALENDAR_MONTH_GRID_GEOMETRY } from '@orbit/shared/utils'

const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

describe('calendar grid tokens', () => {
  it('declares the shared gap on the grid card', () => {
    const card = stylesheet.match(/\.orbit-calendar-grid-card\s*\{([^}]+)\}/)?.[1]
    expect(card).toContain(`--calendar-grid-gap: ${CALENDAR_MONTH_GRID_GEOMETRY.gap}px;`)
  })

  it('removes the gap below the shared content breakpoint', () => {
    const boundary = `@container calendar-grid (width < ${CALENDAR_GRID_GAP_CONTENT_BREAKPOINT}px)`
    const boundaryIndex = stylesheet.indexOf(boundary)
    expect(boundaryIndex).toBeGreaterThanOrEqual(0)
    const compactSection = stylesheet.slice(boundaryIndex)
    const card = compactSection.match(/\.orbit-calendar-grid-card\s*\{([^}]+)\}/)?.[1]
    expect(card).toContain('--calendar-grid-gap: 0px;')
  })
})
