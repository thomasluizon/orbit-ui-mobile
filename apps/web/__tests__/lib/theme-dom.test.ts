import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  neutralColors,
  schemes,
  statusConstants,
  type ColorScheme,
  type ThemeMode,
} from '@orbit/shared'
import {
  applyThemeTokensToDOM,
  resolveWebThemeVariables,
} from '@/lib/theme-dom'

const SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']
const MODES: ThemeMode[] = ['dark', 'light']
const REMOVED_TOKENS = new Set(['--status-frozen', '--status-skip'])

function tokenBlock(heading: string): string {
  const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8')
  const section = design.slice(design.indexOf(heading))
  const blockStart = section.indexOf('```') + 3
  const blockEnd = section.indexOf('```', blockStart)
  return section.slice(blockStart, blockEnd)
}

function documentedTokens(): string[] {
  const blocks = [
    tokenBlock('### Dark mode (the primary theme, byte-exact)'),
    tokenBlock('### Light mode (MANDATORY, ships with every surface)'),
  ]
  return [...new Set(blocks.flatMap((block) =>
    [...block.matchAll(/--[a-z0-9-]+/g)].map(([token]) => token),
  ))].filter((token) => !REMOVED_TOKENS.has(token))
}

describe('web theme variables', () => {
  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  for (const scheme of SCHEMES) {
    for (const mode of MODES) {
      it(`${scheme} ${mode} emits every active token named in DESIGN.md`, () => {
        const variables = resolveWebThemeVariables(scheme, mode)
        for (const token of documentedTokens()) {
          expect(variables, token).toHaveProperty(token)
          expect(variables[token as `--${string}`], token).not.toBe('')
        }
      })

      it(`${scheme} ${mode} matches the shared bytes`, () => {
        const variables = resolveWebThemeVariables(scheme, mode)
        const neutral = neutralColors[mode]
        const accent = schemes[scheme].accent[mode]
        const status = statusConstants[mode]

        expect(variables).toMatchObject({
          '--bg': neutral.bg,
          '--bg-card': neutral.bgCard,
          '--bg-field': neutral.bgField,
          '--bg-well': neutral.bgWell,
          '--bg-elev': neutral.bgElev,
          '--bg-elev-2': neutral.bgElev2,
          '--bg-hover': neutral.bgHover,
          '--bg-sunk': neutral.bgSunk,
          '--hairline': neutral.hairline,
          '--border-control': neutral.borderControl,
          '--hairline-ghost': neutral.hairlineGhost,
          '--hairline-strong': neutral.hairlineStrong,
          '--fg-1': neutral.fg1,
          '--fg-2': neutral.fg2,
          '--fg-3': neutral.fg3,
          '--fg-4': neutral.fg4,
          '--primary': accent.primary,
          '--primary-hover': accent.primaryHover,
          '--primary-pressed': accent.primaryPressed,
          '--primary-soft': accent.primarySoft,
          '--primary-dim': accent.primaryDim,
          '--primary-rgb': accent.primaryRgb,
          '--fg-on-primary': '#FFFFFF',
          '--status-done': neutral.fg1,
          '--status-empty': neutral.fg4,
          '--status-overdue': status.overdue,
          '--status-bad': status.bad,
          '--fg-on-bad': status.fgOnBad,
          '--fg-on-overdue': status.fgOnOverdue,
          '--scrim': neutral.scrim,
        })
      })
    }
  }

  it('applies light tokens to the document', () => {
    applyThemeTokensToDOM('rose', 'light')

    const root = document.documentElement
    expect(root.classList.contains('scheme-rose')).toBe(true)
    expect(root.classList.contains('light')).toBe(true)
    expect(root.style.getPropertyValue('--bg')).toBe('#FAFAFA')
    expect(root.style.getPropertyValue('--bg-hover')).toBe('rgba(9,9,11,0.06)')
    expect(root.style.getPropertyValue('--scrim')).toBe('rgba(0,0,0,0.55)')
  })
})
