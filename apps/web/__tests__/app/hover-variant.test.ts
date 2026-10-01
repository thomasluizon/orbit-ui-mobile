import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type Rule } from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { beforeAll, describe, expect, it } from 'vitest'

const PLAIN_HOVER = '.hover\\:bg-\\[var\\(--bg-hover\\)\\]:hover'
const GROUP_HOVER = '.group-hover\\:opacity-100:is(:where(.group):hover *)'
const HOVER_PSEUDO_CLASS = /(?<!\\):hover/

function gatesOnFinePointerHover(query: string) {
  if (/,|\b(?:or|not|only)\b/.test(query)) return false
  const conditions = query.split(/\band\b/).map((condition) => condition.replaceAll(/\s+/g, ''))
  return conditions.includes('(hover:hover)') && conditions.includes('(pointer:fine)')
}

describe('hover states compiled from app/globals.css', () => {
  const hoverRules: Rule[] = []
  const gatedRules = new Set<Rule>()

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const stylesheet = `${readFileSync(source, 'utf8')}\n@source inline("hover:bg-[var(--bg-hover)] group-hover:opacity-100");`
    const compiled = postcss.parse((await postcss([tailwind()]).process(stylesheet, { from: source })).css)
    compiled.walkRules((rule) => { if (HOVER_PSEUDO_CLASS.test(rule.selector)) hoverRules.push(rule) })
    compiled.walkAtRules('media', (media) => {
      if (gatesOnFinePointerHover(media.params)) media.walkRules((rule) => { gatedRules.add(rule) })
    })
  })

  function gatedSelectors() {
    return [...gatedRules].map((rule) => rule.selector)
  }

  it('paints a hover utility only for a fine pointer that can hover', () => {
    expect(gatedSelectors()).toContain(PLAIN_HOVER)
  })

  it('keeps a group hover fill compounding through the same gate', () => {
    expect(gatedSelectors()).toContain(GROUP_HOVER)
  })

  it('leaves no hover state, utility or hand-written, that a touch tap could latch', () => {
    expect(hoverRules.length).toBeGreaterThan(40)
    expect(hoverRules.filter((rule) => !gatedRules.has(rule)).map((rule) => rule.selector)).toEqual([])
  })

  it('uses the hover variant instead of raw hover selectors in arbitrary variants', () => {
    const violations = ['app', 'components', 'hooks', 'lib', 'stores'].flatMap((directory) => {
      const root = resolve(process.cwd(), directory)
      return readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((path) => /\.[cm]?[jt]sx?$/.test(path))
        .flatMap((path) => {
          const selectors = readFileSync(resolve(root, path), 'utf8').match(/\[[^\]\s]*:hover[^\]\s]*\]/g) ?? []
          return selectors.map((selector) => `${directory}/${path}: ${selector}`)
        })
    })
    expect(violations).toEqual([])
  })
})
