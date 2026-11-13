import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import postcss, { type AtRule, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', '..')
const stylesheet = postcss.parse(readFileSync(join(root, 'app/globals.css'), 'utf8'))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === '__tests__' || name === 'e2e' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const sources = ['app', 'components'].flatMap((directory) => sourceFiles(join(root, directory)))
  .map((path) => ({ path: relative(root, path), lines: readFileSync(path, 'utf8').split('\n') }))

/** Tailwind `active:scale-[0.96]` sets the CSS `scale` property, so only a transition on `scale` (or on `transition-transform`, which lists it) eases the press. */
const PRESS_SCALE_CLASS = /(?:^|[\s"'`])(?:motion-safe:)?(?:enabled:)?active:scale-\[(?:0\.96|0\.99)\]/

/** Classes whose CSS rule owns the press transition. The rules are checked in the stylesheet test below. */
const PRESS_TRANSITION_CLASSES = ['habit-control-motion', 'orbit-pill-action', 'orbit-list-row-body', 'orbit-list-row-action', 'icon-btn']

/** Files that hold class fragments only. The element class carrying the transition sits on another line of the same file. */
const FRAGMENT_FILES = ['components/ui/pill-action-style.ts']

function listOf(text: string | undefined): string[] | undefined {
  return text?.split(',').map((entry) => entry.trim())
}

const BOUNDARY = '(?:^|[\\s"\'`])'

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]
}

/**
 * Reads the three paired lists of the Tailwind transition class that names `scale`, as the duration and the easing
 * at the index of `scale`. A list shorter than the property list repeats, as CSS does.
 */
function pressTransitionOf(classes: string): { duration: string; easing: string } | 'none' {
  const named = [
    ...[...classes.matchAll(new RegExp(`${BOUNDARY}transition-transform(?=[\\s"'\`]|$)`, 'g'))].map((match) => ({ index: match.index, scaleIndex: 0, listed: false })),
    ...[...classes.matchAll(new RegExp(`${BOUNDARY}transition-\\[([^\\]]+)\\]|\\[transition-property:([^\\]]+)\\]`, 'g'))]
      .map((match) => ({ index: match.index, scaleIndex: (listOf(match[1] ?? match[2]) ?? []).indexOf('scale'), listed: true })),
  ].find((candidate) => candidate.scaleIndex >= 0)
  if (!named) return 'none'
  const after = classes.slice(named.index)
  const durations = listOf(firstMatch(after, new RegExp(`${BOUNDARY}duration-\\[([^\\]]+)\\]`)) ?? firstMatch(after, /\[transition-duration:([^\]]+)\]/))
  const easings = listOf(firstMatch(after, new RegExp(`${BOUNDARY}ease-\\[([^\\]]+)\\]`)) ?? firstMatch(after, /\[transition-timing-function:([^\]]+)\]/))
  const at = named.listed ? named.scaleIndex : 0
  return { duration: durations?.[at % durations.length] ?? 'unset', easing: easings?.[at % easings.length] ?? 'unset' }
}

/** The class text of one element: from the nearest `className` line above the press class to the next `className` line below it. */
function elementClasses(lines: string[], index: number): string {
  let start = index
  for (let step = 0; step < 8 && start > 0 && !/className|Class(?:es)?\b/.test(lines[start]!); step++) start--
  let end = index
  while (end + 1 < lines.length && end - index < 3 && !/className/.test(lines[end + 1]!)) end++
  return lines.slice(start, end + 1).join(' ')
}

const pressScaleElements = sources.flatMap(({ path, lines }) => lines.flatMap((line, index) => PRESS_SCALE_CLASS.test(line)
  ? [{ path, line: index + 1, classes: FRAGMENT_FILES.includes(path) ? lines.join(' ') : elementClasses(lines, index) }]
  : []))

function rulesWith(selector: string): Rule[] {
  const rules: Rule[] = []
  stylesheet.walkRules((rule) => { if (rule.selectors.includes(selector)) rules.push(rule) })
  return rules
}

function declarations(rule: Rule, property: string): string[] {
  const values: string[] = []
  rule.walkDecls(property, (declaration) => { values.push(declaration.value.replace(/\s+/g, ' ')) })
  return values
}

describe('web press scale transitions', () => {
  it('finds the press controls it guards', () => {
    expect(pressScaleElements.length).toBeGreaterThan(40)
  })

  it.each(pressScaleElements.map((element) => [`${element.path}:${element.line}`, element] as const))('%s eases its press scale on the press duration and the enter curve', (_name, { classes }) => {
    if (PRESS_TRANSITION_CLASSES.some((name) => new RegExp(`(?:^|[\\s"'\`])${name}(?:[\\s"'\`]|$)`).test(classes))) return
    expect(pressTransitionOf(classes)).toEqual({ duration: 'var(--dur-press)', easing: 'var(--ease-out)' })
  })

  it.each([
    ['.orbit-list-row-body', 'scale'],
    ['.orbit-list-row-shell [data-slot="list-row-content"]', 'scale'],
    ['.orbit-list-row-action', 'scale'],
    ['.habit-control-motion', 'scale'],
    ['.orbit-pill-action', 'scale'],
    ['.icon-btn', 'transform'],
    ['.chip', 'scale'],
    ['.orbit-sheet-close', 'scale'],
  ])('%s transitions %s over the press duration on the enter curve', (selector, property) => {
    const rules = rulesWith(selector).filter((rule) => rule.parent?.type === 'root' || (rule.parent as AtRule).name === 'layer')
    expect(rules.length, selector).toBeGreaterThan(0)
    expect(rules.flatMap((rule) => declarations(rule, 'transition')).join(' | ')).toContain(`${property} var(--dur-press) var(--ease-out)`)
  })

  it('applies every pressed scale rule only when motion is allowed', () => {
    const pressed: string[] = []
    stylesheet.walkRules((rule) => {
      if (!rule.selectors.some((selector) => /:active/.test(selector))) return
      const scales = declarations(rule, 'scale').filter((value) => value !== 'none').concat(declarations(rule, 'transform').filter((value) => /scale\(/.test(value)))
      if (scales.length === 0) return
      const gate = rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : undefined
      if (gate?.name !== 'media' || !/prefers-reduced-motion:\s*no-preference/.test(gate.params)) pressed.push(rule.selector)
    })
    expect(pressed).toEqual([])
  })
})
