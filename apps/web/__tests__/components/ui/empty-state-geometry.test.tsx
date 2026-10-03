import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyStateTitles } from '@orbit/shared/__tests__/empty-state-titles'
import { EmptyState } from '@/components/ui/empty-state'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 360, 384, 412].flatMap((width) => [
  { width, locale: 'pt-BR', words: ptBR }, { width, locale: 'en', words: en },
].flatMap(({ words, ...viewport }) => emptyStateTitles(words).map((title) => ({ ...viewport, ...title }))))

it.each([
  { locale: 'pt-BR', words: ptBR, goals: 'Nenhuma meta ainda' },
  { locale: 'en', words: en, goals: 'No goals yet' },
])('explains the empty goals section in $locale', ({ words, goals }) => {
  expect(words.progressScreen.goals.empty).toBe(goals)
})

describe('EmptyState title geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('$key fits at $width in $locale without truncation', async ({ width, title, inset }) => {
    const { container } = render(<div style={{ paddingInline: inset }}><EmptyState title={title} /></div>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-mark] > p').evaluate((element) => {
        const style = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
        return {
          lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
          fits: fragments.every((rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1),
          lineClamp: style.webkitLineClamp, overflow: style.overflow, textOverflow: style.textOverflow,
          fontSize: style.fontSize,
        }
      })
      expect(geometry.lines).toBe(1)
      expect(geometry.fits).toBe(true)
      expect(geometry.lineClamp).toBe('none')
      expect(geometry.overflow).toBe('visible')
      expect(geometry.textOverflow).not.toBe('ellipsis')
      expect(geometry.fontSize).toBe('20px')
      expect(title).not.toMatch(/[.!]$/)
    } finally { await page.close() }
  })
})
