import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type AtRule } from 'postcss'
import { describe, expect, it } from 'vitest'
import { CALENDAR_GRID_GAP_CONTENT_BREAKPOINT, CALENDAR_MONTH_GRID_GEOMETRY } from '@orbit/shared/utils'

const stylesheet = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'))

/** Every grid card gap declaration with the at-rule that holds its rule, or null at the top level. */
function gridGapDeclarations(): { atRule: string | null; gap: string }[] {
  const declarations: { atRule: string | null; gap: string }[] = []
  stylesheet.walkRules('.orbit-calendar-grid-card', (rule) => {
    const parent = rule.parent
    const atRule = parent?.type === 'atrule' ? `@${(parent as AtRule).name} ${(parent as AtRule).params}` : null
    rule.walkDecls('--calendar-grid-gap', (declaration) => { declarations.push({ atRule, gap: declaration.value }) })
  })
  return declarations
}

describe('calendar grid tokens', () => {
  it('declares the shared gap on the grid card', () => {
    expect(gridGapDeclarations()).toContainEqual({ atRule: null, gap: `${CALENDAR_MONTH_GRID_GEOMETRY.gap}px` })
  })

  it('removes the gap below the shared content breakpoint', () => {
    expect(gridGapDeclarations()).toContainEqual({
      atRule: `@container calendar-grid (width < ${CALENDAR_GRID_GAP_CONTENT_BREAKPOINT}px)`,
      gap: '0px',
    })
  })
})
