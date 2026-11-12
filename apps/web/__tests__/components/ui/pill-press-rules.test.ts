import { readFileSync } from 'node:fs'
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'
import { motionDurations, motionEasings, type ButtonVariant } from '@orbit/shared/theme'
import { actionClasses } from '@/components/ui/pill-action-style'

const stylesheet = postcss.parse(readFileSync('app/globals.css', 'utf8'))

/** The press fill of each variant, as the mobile `PillButton` paints it: primary pressed, the 90% secondary mix, the neutral fill, and the hover mixes of the status fills. */
const pressFills: Record<ButtonVariant, string> = {
  primary: 'var(--primary-pressed)',
  secondary: 'color-mix(in_srgb,var(--fg-1)_90%,var(--bg))',
  ghost: 'var(--bg-hover)',
  destructive: 'color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))',
  caution: 'color-mix(in_srgb,var(--status-overdue)_85%,black)',
}

function ruleWith(selector: string): Rule {
  const rules: Rule[] = []
  stylesheet.walkRules((rule) => { if (rule.selectors.includes(selector)) rules.push(rule) })
  expect(rules, selector).toHaveLength(1)
  return rules[0]!
}

function value(rule: Rule, property: string): string[] {
  const values: string[] = []
  rule.walkDecls(property, (declaration) => { values.push(declaration.value) })
  return values
}

function pressFillClasses(classes: string): string[] {
  return classes.split(' ').filter((name) => /(^|:)active:bg-\[/.test(name))
}

describe('web pill press feedback', () => {
  it('eases the press scale on the shared press duration and enter curve', () => {
    const [transition] = value(ruleWith('.orbit-pill-action'), 'transition')
    expect(transition).toContain('scale var(--dur-press) var(--ease-out)')
    expect(transition).toContain('opacity var(--dur-1) var(--ease-out)')
    const tokens: Record<string, string[]> = {}
    stylesheet.walkDecls(/^--(dur-press|ease-out)$/, (declaration) => { (tokens[declaration.prop] ??= []).push(declaration.value) })
    expect(tokens).toEqual({
      '--dur-press': [`${motionDurations.press}ms`],
      '--ease-out': [`cubic-bezier(${motionEasings.enter.join(', ')})`],
    })
  })

  it.each(['button', 'link'] as const)('paints the mobile press fill on every %s variant, with no hover or motion gate', (element) => {
    for (const variant of Object.keys(pressFills) as ButtonVariant[]) {
      const pressed = pressFillClasses(actionClasses(variant, 'sm', element))
      if (element === 'button' && variant === 'primary') expect(pressed, 'the primary button press fill lives beside its hover rule').toEqual([])
      else expect(pressed, `${variant} ${element}`).toEqual([`${element === 'button' ? 'enabled:' : ''}active:bg-[${pressFills[variant]}]`])
      expect(pressFillClasses(actionClasses(variant, 'sm', element, true)), `${variant} ${element} loading`).toEqual([])
    }
  })

  it('paints the quiet and elevated ghost press fills of the mobile ghost', () => {
    expect(pressFillClasses(actionClasses('ghost', 'sm', 'button', false, true))).toEqual(['enabled:active:bg-[var(--bg-hover-opaque)]'])
    expect(pressFillClasses(actionClasses('ghost', 'sm', 'button', false, false, true))).toEqual(['enabled:active:bg-[var(--bg-elev-hover)]'])
  })

  it('lets the primary button and FAB press fill win over their pointer hover, also on touch', () => {
    const hover = ruleWith('button[data-variant="primary"]:enabled:hover')
    const pressed = ruleWith('button[data-variant="primary"]:enabled:not([data-loading]):active')
    expect(hover.selectors).toEqual(['button[data-variant="primary"]:enabled:hover', '[data-fab]:not([data-fab="neutral"]):hover'])
    expect(pressed.selectors).toEqual(['button[data-variant="primary"]:enabled:not([data-loading]):active', '[data-fab]:not([data-fab="neutral"]):active'])
    expect(value(hover, 'background')).toEqual(['var(--primary-hover)'])
    expect(value(pressed, 'background')).toEqual(['var(--primary-pressed)'])
    expect(pressed.parent?.type, 'unlayered and outside the hover query').toBe('root')
    expect(pressed.source!.start!.line).toBeGreaterThan(hover.source!.start!.line)
  })
})
