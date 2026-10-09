import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { ShellWide } from '@/components/shell/shell-wide'
import { PillButton } from '@/components/ui/pill-button'
import { ArrowUp } from '@/components/ui/icons'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/components/ui/lockup', () => ({ Lockup: () => <span>Orbit</span> }))

describe('Hoje back-to-top shell geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([en, ptBR].flatMap((messages) => [1, 2].flatMap((textScale) => (['dark', 'light'] as const).map((mode) => ({ messages, textScale, mode })))))(
    'keeps the $messages.common.top pill clear of the header, FAB and final row at $textScale text in $mode',
    async ({ messages, textScale, mode }) => {
      const { container } = render(
        <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation}
          header={<div style={{ minHeight: 48 }}>Header</div>}
          composer={<div style={{ minHeight: 48 }}>Composer</div>}
          tabBar={<div style={{ minHeight: 80 }}>Tabs</div>}
          fab={<button type="button" style={{ width: 48, height: 48 }}>+</button>}
          scrollToTop={<PillButton variant="ghost" quiet elevated minimumHeight={48} accessibleName={messages.common.backToTop}
            leadingIcon={<ArrowUp size={20} strokeWidth={2} aria-hidden="true" />} onClick={vi.fn()}>{messages.common.top}</PillButton>}>
          {Array.from({ length: 40 }, (_, index) => <div key={index} data-row={index} style={{ minHeight: 48 }}>Habit {index}</div>)}
        </ShellWide>,
      )
      for (const width of [320, 412]) {
        const page = await browser.newPage({ viewport: { width, height: 740 }, reducedMotion: 'reduce' })
        try {
          const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
          await page.setContent(`<style>${stylesheet}:root{${theme};--safe-bottom:24px}html{font-size:${16 * textScale}px}</style>${container.innerHTML}`)
          await loadAppFonts(page)
          const pill = page.getByRole('button', { name: messages.common.backToTop })
          const bounds = (await pill.boundingBox())!
          const header = (await page.locator('[data-shell-header]').boundingBox())!
          const fab = (await page.locator('[data-shell-fab]').boundingBox())!
          const scroller = (await page.locator('[data-shell-scroller]').boundingBox())!
          expect(bounds.height).toBeGreaterThanOrEqual(48)
          expect(bounds.width).toBeGreaterThanOrEqual(48)
          expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height)
          expect(bounds.x + bounds.width / 2).toBeCloseTo(scroller.x + scroller.width / 2)
          expect(bounds.y + bounds.height).toBeLessThan(fab.y)
          const text = await pill.locator('span').evaluate((element) => {
            const range = document.createRange(); range.selectNodeContents(element)
            return { available: element.getBoundingClientRect().width, text: range.getBoundingClientRect().width, whiteSpace: getComputedStyle(element).whiteSpace }
          })
          expect(text.text).toBeLessThanOrEqual(text.available)
          expect(text.whiteSpace).toBe('nowrap')
          await page.locator('[data-shell-scroller]').evaluate((element) => { element.scrollTop = element.scrollHeight })
          const lastRow = (await page.locator('[data-row="39"]').boundingBox())!
          expect(lastRow.y).toBeGreaterThan(bounds.y + bounds.height)
          expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(scroller.y + scroller.height)
          expect(lastRow.y + lastRow.height).toBeLessThan(fab.y)
          for (const hovered of [false, true]) {
            if (hovered) await pill.hover()
            const colors = await pill.evaluate((element) => {
              const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
              const context = canvas.getContext('2d')!
              const rgb = (color: string) => {
                context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1)
                const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
                return `rgba(${r},${g},${b},${alpha! / 255})`
              }
              return { label: rgb(getComputedStyle(element).color), fill: rgb(getComputedStyle(element).backgroundColor) }
            })
            expect(contrastOnSurface(colors.label, [colors.fill])).toBeGreaterThanOrEqual(4.5)
          }
          await page.keyboard.press('Tab')
          await pill.focus()
          expect(await pill.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        } finally { await page.close() }
      }
    },
  )
})
