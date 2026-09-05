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
  canvasColor,
  resolveWebThemeVariables,
} from '@/lib/theme-dom'
import { RESPONSIVE_TYPE_BREAKPOINT, responsiveTypeRoles } from '@orbit/shared/theme'

const SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']
const MODES: ThemeMode[] = ['dark', 'light']

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
  ))]
}

describe('web theme variables', () => {
  it('publishes both responsive type pairs from the shared contract', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const boundary = `@media (min-width: ${RESPONSIVE_TYPE_BREAKPOINT / 16}rem)`
    const wideSection = stylesheet.slice(stylesheet.indexOf(boundary))
    for (const [selector, name] of [
      ['t-display-heading', 'displayHeading'], ['t-allowance', 'allowance'],
    ] as const) {
      const role = responsiveTypeRoles[name]
      const pattern = new RegExp(`\\.${selector} \\{([^}]+)\\}`)
      const compact = stylesheet.match(pattern)?.[1]
      const wide = wideSection.match(pattern)?.[1]
      expect(compact).toContain(`font-family: var(--font-${role.family});`)
      expect(compact).toContain(`font-weight: ${role.weight};`)
      expect(compact).toContain(`letter-spacing: ${role.letterSpacingEm}em;`)
      expect(compact).toContain('color: var(--fg-1);')
      expect(compact).toContain(`font-size: ${role.compact.size}px;`)
      expect(compact).toContain(`line-height: ${role.compact.lineHeight};`)
      expect(wide).toContain(`font-size: ${role.wide.size}px;`)
      expect(wide).toContain(`line-height: ${role.wide.lineHeight};`)
      if ('tabularNums' in role) expect(compact).toContain('font-variant-numeric: tabular-nums;')
    }
  })

  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = ''
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
          '--status-frozen': 'var(--fg-2)',
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
    document.head.innerHTML = [
      '<meta name="theme-color" content="">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="">',
    ].join('')
    applyThemeTokensToDOM('rose', 'light')

    const root = document.documentElement
    expect(root.classList.contains('scheme-rose')).toBe(true)
    expect(root.classList.contains('light')).toBe(true)
    expect(root.style.getPropertyValue('--bg')).toBe('#FAFAFA')
    expect(root.style.getPropertyValue('--bg-hover')).toBe('rgba(9,9,11,0.06)')
    expect(root.style.getPropertyValue('--scrim')).toBe('rgba(0,0,0,0.55)')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      canvasColor('rose', 'light'),
    )
    expect(document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'))
      .toHaveAttribute('content', 'default')
  })

  it('publishes the Hoje hover roles and durations to stylesheet consumers', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
      .replaceAll('\r\n', '\n')

    expect(stylesheet).toContain(
      '.icon-btn {\n  appearance: none;',
    )
    expect(stylesheet).toContain(
      'background-color var(--dur-hover-control) var(--ease-standard)',
    )
    expect(stylesheet).toContain(
      '.icon-btn:hover,\n  .icon-btn-well:hover {\n    background: var(--bg-hover);',
    )
    expect(stylesheet).toContain(
      '.orbit-menu-item:hover:not(:disabled) {\n    background: var(--bg-hover);',
    )
    expect(stylesheet).toContain(
      'button[data-variant="primary"]:enabled:hover,\n  [data-fab]:hover {\n    background: var(--primary-hover);',
    )
    expect(stylesheet).toContain(
      '.orbit-link-action::after {',
    )
    expect(stylesheet).toContain(
      'transform-origin: left;\n  transition: transform var(--dur-hover) var(--ease-standard);',
    )
    expect(stylesheet).toContain(
      '.orbit-link-action:hover::after {\n    transform: scaleX(1);',
    )
    expect(stylesheet).toContain(
      '.orbit-link-action-persistent {\n  text-decoration: underline;',
    )
    expect(stylesheet).toContain(
      '.orbit-link-action-persistent::after {\n  content: none;',
    )
  })
})
