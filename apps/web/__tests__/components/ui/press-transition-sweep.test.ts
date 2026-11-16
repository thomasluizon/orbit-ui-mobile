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

const PRESS_SCALE_CLASS = /(?:^|[\s"'`])(?:motion-safe:)?(?:(?:group-)?enabled(?:\/[\w-]+)?:)?(?:group-)?active(?:\/[\w-]+)?:scale-\[(?:0\.96|0\.99)\]/

const PRESS_TRANSITION_CLASSES = ['habit-control-motion', 'orbit-pill-action', 'orbit-list-row-body', 'orbit-list-row-action', 'icon-btn']

const FRAGMENT_FILES = ['components/ui/pill-action-style.ts']

function listOf(text: string | undefined): string[] | undefined {
  return text?.split(',').map((entry) => entry.trim())
}

const BOUNDARY = '(?:^|[\\s"\'`])'

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]
}

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

function elementClasses(lines: string[], index: number): string {
  let start = index
  for (let step = 0; step < 8 && start > 0 && !/className|Class(?:es)?\b/.test(lines[start]!); step++) start--
  let end = index
  while (end + 1 < lines.length && end - index < 3 && !/className/.test(lines[end + 1]!)) end++
  return lines.slice(start, end + 1).join(' ')
}

function openingTag(lines: string[], index: number): string {
  let start = index
  for (let step = 0; step < 16 && start > 0 && !/<[A-Za-z][\w.]*(?:\s|$)/.test(lines[start]!); step++) start--
  return lines.slice(start, index + 1).join(' ')
}

const INLINE_TRANSITION = /\btransition:\s*['"`]/

const pressScaleElements = sources.flatMap(({ path, lines }) => lines.flatMap((line, index) => PRESS_SCALE_CLASS.test(line)
  ? [{ path, line: index + 1, classes: FRAGMENT_FILES.includes(path) ? lines.join(' ') : elementClasses(lines, index), tag: openingTag(lines, index) }]
  : []))

function classParts(token: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < token.length; index++) {
    const character = token[index]!
    if (character === '[' || character === '(') depth++
    else if (character === ']' || character === ')') depth--
    else if (character === ':' && depth === 0) {
      parts.push(token.slice(start, index))
      start = index + 1
    }
  }
  return [...parts, token.slice(start)]
}

const SCALE_UTILITY = /^!?-?scale-(?:[xy]-)?[^\s]|^!?\[scale:|^!?\[transform:[^\]]*scale/
const PRESS_VARIANT = /(?:^|[-:(\[_])active(?:$|[/\]):_])/

type PressScaleForm = 'target' | 'holder' | 'face'

function pressScaleForm(variants: readonly string[]): PressScaleForm | undefined {
  if (!variants.some((variant) => PRESS_VARIANT.test(variant))) return undefined
  if (variants.some((variant) => /(?:^has-)|(?::has\()/.test(variant))) return 'holder'
  if (variants.some((variant) => /^(?:group|peer|in)-|^\*{1,2}$|^\[[^\]]*&[^\]]*[_>+~]/.test(variant))) return 'face'
  return 'target'
}

function pressScaleTokens(line: string): { token: string; form: PressScaleForm }[] {
  return (line.match(/[^\s"'`{}$]+/g) ?? []).flatMap((token) => {
    const parts = classParts(token)
    if (!SCALE_UTILITY.test(parts.at(-1)!)) return []
    const form = pressScaleForm(parts.slice(0, -1))
    return form ? [{ token, form }] : []
  })
}

const pressScaleTokenSites = sources.flatMap(({ path, lines }) => lines.flatMap((line, index) => pressScaleTokens(line).map((found) => ({
  ...found, path, line: index + 1, classes: FRAGMENT_FILES.includes(path) ? lines.join(' ') : elementClasses(lines, index),
}))))

const CLIP_CLASS = /(?:^|[\s"'`])overflow-(?:hidden|clip)(?:[\s"'`]|$)/

function classPattern(names: readonly string[]): RegExp {
  return new RegExp(`(?:^|[\\s"'\`])(?:${names.join('|')})(?:[\\s"'\`]|$)`)
}

function pressedScaleRules(): Rule[] {
  const pressed: Rule[] = []
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.some((selector) => /:active/.test(selector))) return
    const scales = declarations(rule, 'scale').filter((value) => value !== 'none').concat(declarations(rule, 'transform').filter((value) => /scale\(/.test(value)))
    if (scales.length > 0) pressed.push(rule)
  })
  return pressed
}

function reducedMotionGated(rule: Rule): boolean {
  const gate = rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : undefined
  return gate?.name === 'media' && /prefers-reduced-motion:\s*no-preference/.test(gate.params)
}

function hitLayerHosts(): string[] {
  const covers = new Set<string>()
  const counterScales = new Set<string>()
  stylesheet.walkRules((rule) => {
    for (const selector of rule.selectors) {
      const covered = /^\.([\w-]+)::before$/.exec(selector)?.[1]
      if (covered && declarations(rule, 'inset').includes('0') && declarations(rule, 'position').includes('absolute')) covers.add(covered)
      const counterScaled = /^\.([\w-]+):active::before$/.exec(selector)?.[1]
      if (counterScaled && reducedMotionGated(rule) && declarations(rule, 'scale').includes('calc(1 / 0.96)')) counterScales.add(counterScaled)
    }
  })
  return [...covers].filter((host) => counterScales.has(host))
}

function subjectOf(selector: string): string {
  let depth = 0
  let start = 0
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!
    if (character === '(' || character === '[') depth++
    else if (character === ')' || character === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(character)) start = index + 1
  }
  return selector.slice(start)
}

function outerCompound(compound: string): string {
  let outer = compound
  while (/\([^()]*\)/.test(outer)) outer = outer.replace(/\([^()]*\)/g, '')
  return outer
}

function pressSelectorForm(selector: string): PressScaleForm {
  const subject = subjectOf(selector)
  const outer = outerCompound(subject)
  if (outer.includes('::')) return 'face'
  if (outer.includes(':active')) return 'target'
  return /:has\(/.test(subject) && subject.includes(':active') ? 'holder' : 'face'
}

function subjectClasses(selector: string): string[] {
  return [...outerCompound(subjectOf(selector)).matchAll(/\.([\w-]+)/g)].map(([, name]) => name!)
}

function pressedTargetSelectors(): string[] {
  return pressedScaleRules().flatMap((rule) => rule.selectors).filter((selector) => pressSelectorForm(selector) === 'target')
}

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

  it.each(pressScaleElements.map((element) => [`${element.path}:${element.line}`, element] as const))('%s eases its press scale on the press duration and the enter curve', (_name, { classes, tag }) => {
    expect(tag, 'an inline transition voids the transition classes this test reads').not.toMatch(INLINE_TRANSITION)
    if (PRESS_TRANSITION_CLASSES.some((name) => new RegExp(`(?:^|[\\s"'\`])${name}(?:[\\s"'\`]|$)`).test(classes))) return
    expect(pressTransitionOf(classes)).toEqual({ duration: 'var(--dur-press)', easing: 'var(--ease-out)' })
  })

  it('finds the press targets that scale their own box, in every form the code base uses', () => {
    expect(pressScaleTokenSites.filter(({ form }) => form === 'target').length).toBeGreaterThan(65)
    expect(pressedTargetSelectors().length).toBeGreaterThanOrEqual(2)
    expect(hitLayerHosts()).toContain('press-hit-layer')
  })

  it('scales the face of every press target over its unscaled hit layer, so its hit area and its focus ring stay whole', () => {
    const hosts = classPattern(hitLayerHosts())
    const sites = (found: typeof pressScaleTokenSites) => found.map(({ path, line, token }) => `${path}:${line} ${token}`)
    const targets = pressScaleTokenSites.filter(({ form }) => form === 'target')
    expect({
      unlayered: sites(targets.filter(({ classes }) => !hosts.test(classes))),
      clipped: sites(targets.filter(({ classes }) => CLIP_CLASS.test(classes))),
      holders: sites(pressScaleTokenSites.filter(({ form }) => form === 'holder')),
    }).toEqual({ unlayered: [], clipped: [], holders: [] })
  })

  it('gives every stylesheet press scale on a target box the hit layer, and lets no box scale while it holds the pressed target', () => {
    const hosts = hitLayerHosts()
    expect({
      unlayered: pressedTargetSelectors().filter((selector) => !subjectClasses(selector).some((name) => hosts.includes(name))),
      holders: pressedScaleRules().flatMap((rule) => rule.selectors).filter((selector) => pressSelectorForm(selector) === 'holder'),
    }).toEqual({ unlayered: [], holders: [] })
  })

  it('keeps every element that carries a stylesheet-pressed host class unclipped, so the clip does not cut its hit layer back', () => {
    const pressedHosts = pressedTargetSelectors().flatMap(subjectClasses)
    expect(pressedHosts.length).toBeGreaterThan(0)
    const clipped = sources.flatMap(({ path, lines }) => lines.flatMap((line, index) => classPattern(pressedHosts).test(line) && CLIP_CLASS.test(elementClasses(lines, index))
      ? [`${path}:${index + 1}`] : []))
    const clippedRules = pressedHosts.flatMap((host) => rulesWith(`.${host}`).flatMap((rule) => declarations(rule, 'overflow').filter((value) => /hidden|clip/.test(value)).map((value) => `.${host} overflow: ${value}`)))
    expect({ clipped, clippedRules }).toEqual({ clipped: [], clippedRules: [] })
  })

  it('gates every press scale class on motion-safe, so reduced motion keeps the control still', () => {
    const ungated = pressScaleTokenSites.filter(({ token }) => !token.startsWith('motion-safe:')).map(({ path, line, token }) => `${path}:${line} ${token}`)
    expect(ungated).toEqual([])
  })

  it.each([
    ['.orbit-list-row-body', 'scale'],
    ['.orbit-list-row-shell [data-slot="list-row-content"]', 'scale'],
    ['.orbit-list-row-action', 'scale'],
    ['.habit-control-motion', 'scale'],
    ['.orbit-pill-action', 'scale'],
    ['.icon-btn', 'transform'],
    ['.chip', 'scale'],
    ['.orbit-sheet-close > svg', 'scale'],
  ])('%s transitions %s over the press duration on the enter curve', (selector, property) => {
    const rules = rulesWith(selector).filter((rule) => rule.parent?.type === 'root' || (rule.parent as AtRule).name === 'layer')
    expect(rules.length, selector).toBeGreaterThan(0)
    expect(rules.flatMap((rule) => declarations(rule, 'transition')).join(' | ')).toContain(`${property} var(--dur-press) var(--ease-out)`)
  })

  it('keeps the focus ring of a pressed hit-layer target whole by drawing it on the unscaled hit layer', () => {
    const declarationsOf = (selector: string) => {
      const found: { media: string | undefined; layered: boolean; values: Record<string, string> }[] = []
      stylesheet.walkRules((rule) => {
        if (rule.selector !== selector) return
        const values: Record<string, string> = {}
        rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value })
        const media = rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : undefined
        found.push({ media: media?.params, layered: media?.parent?.type === 'atrule' && (media.parent as AtRule).name === 'layer', values })
      })
      return found
    }
    const hosts = `:is(${hitLayerHosts().map((host) => `.${host}`).join(', ')})`
    expect(hosts).toBe(':is(.press-hit-layer, .chip, .icon-btn)')
    expect(declarationsOf(`${hosts}:focus-visible:active`)).toEqual([{ media: '(prefers-reduced-motion: no-preference)', layered: false, values: { 'outline-style': 'none' } }])
    expect(declarationsOf(`${hosts}:focus-visible:active::before`)).toEqual([{ media: '(prefers-reduced-motion: no-preference)', layered: false,
      values: { outline: '2px solid', 'outline-color': 'inherit', 'outline-offset': 'inherit' } }])
    expect(declarationsOf('.orbit-list-action-surface .orbit-list-row-body.press-hit-layer:focus-visible:active::before')).toEqual([{ media: '(prefers-reduced-motion: no-preference)', layered: false, values: { outline: 'none' } }])
    expect(declarationsOf('[data-habit-row-control="check"].press-hit-layer:focus-visible:active::before'), 'a habit check draws its ring on the inner check, so its hit layer draws none')
      .toEqual([{ media: '(prefers-reduced-motion: no-preference)', layered: false, values: { outline: 'none' } }])
  })

  it('applies every pressed scale rule only when motion is allowed', () => {
    expect(pressedScaleRules().filter((rule) => !reducedMotionGated(rule)).map((rule) => rule.selector)).toEqual([])
  })
})
