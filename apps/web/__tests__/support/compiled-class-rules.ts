import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type Rule } from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { expect } from 'vitest'

export interface CompiledRule { state: string; order: number; media: string[]; declarations: Map<string, string> }

export const FINE_POINTER_HOVER = '(hover: hover) and (pointer: fine)'
export const MOTION_SAFE = '(prefers-reduced-motion: no-preference)'

function classSelector(name: string) {
  return `.${name.replace(/[^\w-]/g, (character) => `\\${character}`)}`
}

/** Every class the rendered markup under `root` carries, so the compile emits each utility it uses. */
export function classNamesIn(root: ParentNode) {
  return [...root.querySelectorAll('[class]')].flatMap((element) => [...element.classList])
}

/**
 * Compiles `app/globals.css` with Tailwind for `names` and indexes every rule that starts with one of
 * those classes by its state suffix, its media queries and its source order.
 */
export async function compileClassRules(names: Iterable<string>) {
  const unique = new Set(names)
  const rulesByClass = new Map<string, CompiledRule[]>()
  const source = resolve(process.cwd(), 'app/globals.css')
  const stylesheet = `${readFileSync(source, 'utf8')}\n@source inline("${[...unique].join(' ')}");`
  const compiled = postcss.parse((await postcss([tailwind()]).process(stylesheet, { from: source })).css)
  const mediaByRule = new Map<Rule, string[]>()
  compiled.walkAtRules('media', (query) => query.walkRules((rule) => { mediaByRule.set(rule, [...(mediaByRule.get(rule) ?? []), query.params]) }))
  let order = 0
  compiled.walkRules((rule) => {
    order += 1
    const media = mediaByRule.get(rule) ?? []
    const declarations = new Map<string, string>()
    rule.walkDecls((declaration) => { declarations.set(declaration.prop, declaration.value) })
    for (const name of unique) {
      const selector = classSelector(name)
      if (!rule.selector.startsWith(selector)) continue
      const state = rule.selector.slice(selector.length)
      if (state && !/^[:.[\s]/.test(state)) continue
      rulesByClass.set(name, [...(rulesByClass.get(name) ?? []), { state, order, media, declarations }])
    }
  })

  function rulesFor(element: Element) {
    return [...element.classList].flatMap((name) => rulesByClass.get(name) ?? []).sort((left, right) => left.order - right.order)
  }

  function declarationsIn(element: Element, state = '', media: readonly string[] = []) {
    const merged = new Map<string, string>()
    for (const rule of rulesFor(element)) {
      if (rule.state !== state || rule.media.join('|') !== media.join('|')) continue
      for (const [property, value] of rule.declarations) merged.set(property, value)
    }
    return merged
  }

  return { rulesFor, declarationsIn }
}

export type CompiledClassRules = Awaited<ReturnType<typeof compileClassRules>>

/** A fine pointer hover sets `property` to `value`, and an ungated press rule with the same selector shape follows it, so a touch press sets it too. */
export function expectHoverAndPress(rules: CompiledClassRules, element: Element, value: string, property = 'background-color') {
  const painting = rules.rulesFor(element).filter((rule) => rule.declarations.get(property) === value)
  const hover = painting.filter((rule) => rule.state.includes(':hover'))
  const press = painting.filter((rule) => rule.state.includes(':active'))
  expect(hover).toHaveLength(1)
  expect(press).toHaveLength(1)
  expect(hover[0]!.media).toEqual([FINE_POINTER_HOVER])
  expect(press[0]!.media).toEqual([])
  expect(press[0]!.state).toBe(hover[0]!.state.replace(':hover', ':active'))
  expect(press[0]!.order).toBeGreaterThan(hover[0]!.order)
}
