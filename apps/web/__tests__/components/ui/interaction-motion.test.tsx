import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss, { list, type AtRule, type Node } from 'postcss'
import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { SelectionIndicator } from '@/components/ui/selection-indicator'

function mediaConditions(node: Node): string[] {
  const conditions: string[] = []
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && (parent as AtRule).name === 'media') conditions.push((parent as AtRule).params)
  }
  return conditions
}

/** The comma-separated legs of the one `transition` declaration on a rule whose selector list holds `selector`. */
function transitionLegs(selector: string): string[] {
  const legs: string[][] = []
  postcss.parse(readFileSync('app/globals.css', 'utf8')).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return
    rule.walkDecls('transition', (declaration) => { legs.push(list.comma(declaration.value).map((leg) => leg.replace(/\s+/g, ' '))) })
  })
  expect(legs, selector).toHaveLength(1)
  return legs[0]!
}

describe('interaction motion', () => {
  it('keeps selection paint inside the control', () => {
    const view = render(<SelectionIndicator id="selection" calendar />)
    expect(view.container.querySelector('[data-selection-motion]')).toHaveClass('absolute', 'inset-0', 'rounded-[inherit]')
    const stylesheet = readFileSync('app/globals.css', 'utf8')
    expect(stylesheet).toMatch(/\[data-selection-motion\] \{ transform: none !important/)
  })
  it('changes the completion fill without delaying a toggle or adding bounce', () => {
    const onToggle = vi.fn()
    const view = render(<CheckCircle state="empty" onToggle={onToggle} disabled={false} ariaLabel="Complete" />)
    fireEvent.click(view.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
    view.rerender(<CheckCircle state="done" onToggle={onToggle} disabled={false} ariaLabel="Complete" />)
    expect(view.container.querySelector('[data-habit-check]')).toHaveClass('habit-check-motion')
    expect(view.container.querySelector('.animate-check-pop')).toBeNull()
  })

  it('keeps reduced-motion presses at unit scale and uses the shared duration', () => {
    const stylesheet = readFileSync('app/globals.css', 'utf8')
    expect(stylesheet).toMatch(/habit-check-motion\s*\{\s*transition: background-color var\(--dur-press\)/)
    expect(stylesheet).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:is\(button, a,.*?:active\s*\{\s*scale: none !important/s)
  })

  it('keeps the kit icon button press fill under reduced motion and scales it only when motion is allowed', () => {
    const css = postcss.parse(readFileSync('app/globals.css', 'utf8'))
    const pressDeclarations: [string, string, string[]][] = []
    css.walkRules((rule) => {
      if (!rule.selectors.includes('.icon-btn:active')) return
      rule.walkDecls((declaration) => { pressDeclarations.push([declaration.prop, declaration.value, mediaConditions(declaration)]) })
    })
    expect(pressDeclarations).toEqual([
      ['background', 'var(--bg-hover)', []],
      ['transform', 'scale(0.96)', ['(prefers-reduced-motion: no-preference)']],
    ])
  })

  it('eases the kit icon button press over the shared press duration while its fill keeps the control hover timing', () => {
    expect(transitionLegs('.icon-btn')).toEqual([
      'background-color var(--dur-hover-control) var(--ease-standard)',
      'color var(--dur-hover-control) var(--ease-standard)',
      'transform var(--dur-press) var(--ease-out)',
    ])
  })

  it.each([
    ['.icon-btn', 'transform'],
    ['.orbit-pill-action', 'scale'],
    ['.habit-control-motion', 'scale'],
    ['.orbit-list-row-action', 'scale'],
  ])('eases the %s press scale on the property its press sets, over the shared press duration and ease-out curve', (selector, property) => {
    expect(transitionLegs(selector).filter((leg) => /^(transform|scale) /.test(leg))).toEqual([`${property} var(--dur-press) var(--ease-out)`])
  })

  it('leaves every press class to own its press timing, with no transition utility beside it', () => {
    const carriers = new Set(['icon-btn', 'habit-control-motion', 'orbit-list-row-action', 'orbit-pill-action'])
    const overrides: string[] = []
    for (const file of ['app', 'components'].flatMap((directory) => readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.tsx') || name.endsWith('.ts')).map((name) => join(directory, name)))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        for (const [, , literal = ''] of line.matchAll(/(["'`])(.*?)\1/g)) {
          const classes = literal.split(/\s+/)
          if (!classes.some((name) => carriers.has(name))) continue
          const timing = classes.filter((name) => /^(?:[\w-]+:)*(?:transition|duration|ease)(?:-|$)|^\[transition/.test(name))
          if (timing.length > 0) overrides.push(`${file}:${index + 1} ${timing.join(' ')}`)
        }
      })
    }
    expect(overrides).toEqual([])
  })
})
