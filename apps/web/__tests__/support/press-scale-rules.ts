import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type AtRule } from 'postcss'
import tailwind from '@tailwindcss/postcss'

export interface PressScaleRule { selectors: string[]; media: string[] }

/** An unescaped `:active`: Tailwind escapes the colons inside a class name such as `active\:scale-[0.96]`. */
const ACTIVE = /(?<!\\):active/g

/** Every compiled rule that scales an element while something is pressed, with the media queries that gate it. */
export async function compilePressScaleRules(): Promise<PressScaleRule[]> {
  const source = resolve(process.cwd(), 'app/globals.css')
  const compiled = postcss.parse((await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css)
  const rules: PressScaleRule[] = []
  compiled.walkRules((rule) => {
    if (!new RegExp(ACTIVE.source).test(rule.selector)) return
    const scales = rule.nodes.some((node) => node.type === 'decl'
      && ((node.prop === 'scale' && node.value !== 'none') || (node.prop === 'transform' && /scale\(/.test(node.value))))
    if (!scales) return
    const media: string[] = []
    for (let parent = rule.parent; parent?.type === 'atrule'; parent = parent.parent) {
      if ((parent as AtRule).name === 'media') media.push((parent as AtRule).params)
    }
    rules.push({ selectors: rule.selectors, media })
  })
  return rules
}

/** The elements that a press on `control` scales. As in the browser, `:active` holds for the control and for each of its ancestors. */
export function scaledWhilePressed(rules: readonly PressScaleRule[], control: Element) {
  const pressed: Element[] = []
  for (let element: Element | null = control; element; element = element.parentElement) pressed.push(element)
  for (const element of pressed) element.setAttribute('data-press-probe', '')
  try {
    return rules.flatMap(({ selectors, media }) => selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector.replace(ACTIVE, '[data-press-probe]'))].map((element) => ({ element, media }))))
  } finally {
    for (const element of pressed) element.removeAttribute('data-press-probe')
  }
}
