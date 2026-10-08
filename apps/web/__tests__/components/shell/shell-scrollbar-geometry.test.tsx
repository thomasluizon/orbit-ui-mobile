import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShellWide } from '@/components/shell/shell-wide'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { measureScrollbarGutter } from '@/e2e/layout/scrollbar-geometry'
import { measureScrollbarPaint } from '@/e2e/layout/scrollbar-paint'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Shell scrollbar geometry and paint', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch }, {
    ignoreDefaultArgs: ['--hide-scrollbars'],
  })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet += `:root{${theme}}`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([1352, 1100, 600])('reserves 4px without painting at rest and reveals only hovered thumbs at %ipx', async (width) => {
    const view = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
      header={<button type="button">Header</button>}
      notice={<div>Notice</div>} composer={<button type="button">Composer</button>}
      tabBar={<nav>Tabs</nav>} fab={<button type="button">Create</button>}>
      <div style={{ height: 1600 }}>
        <div data-scroll-probe="" className="thin-scrollbar" style={{ overflow: 'auto', width: 200, height: 100, border: '1px solid', background: 'var(--bg)' }}>
          <div style={{ width: 400, height: 200 }} />
        </div>
        <div data-scroll-sibling="" style={{ overflow: 'auto', width: 200, height: 100, background: 'var(--bg)' }}>
          <div style={{ height: 200 }} />
        </div>
      </div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 706 }, locale: 'pt-BR', colorScheme: 'dark' })
    try {
      await page.setContent(`<!doctype html><html class="dark" lang="pt-BR"><style>${stylesheet}</style>${view.container.innerHTML}</html>`)
      await page.mouse.move(0, 0)
      const shell = page.locator('[data-shell-scroller]')
      const gutter = await shell.evaluate(measureScrollbarGutter)
      expect(gutter).toBe(4)
      const scrollers = page.locator('[data-shell-scroller], [data-shell-header], [data-shell-notice], [data-shell-pinned-slot], [data-shell-fab-clip], [data-scroll-probe], [data-scroll-sibling]')
      expect(await scrollers.count()).toBe(7)
      for (const scroller of await scrollers.all()) {
        const visible = await scroller.evaluate((element) => element.getClientRects().length > 0)
        expect.soft(await scroller.evaluate(measureScrollbarGutter), 'vertical gutter').toBe(visible ? gutter : 0)
        const horizontal = await scroller.evaluate((element: HTMLElement) => {
          const style = getComputedStyle(element)
          return element.offsetHeight - element.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)
        })
        expect.soft(horizontal, 'horizontal gutter').toBe(await scroller.getAttribute('data-scroll-probe') === null ? 0 : gutter)
      }
      const probe = page.locator('[data-scroll-probe]')
      expect.soft(await probe.evaluate((element) => getComputedStyle(element).paddingBottom)).toBe('0px')
      await page.waitForTimeout(1500)
      for (const scroller of [shell, probe, page.locator('[data-scroll-sibling]')]) {
        const paint = await measureScrollbarPaint(scroller)
        expect.soft(paint.backgroundPixels, 'resting trailing edge matches the canvas').toBe(paint.totalPixels)
      }
      const horizontalPaint = await measureScrollbarPaint(probe, 'horizontal')
      expect.soft(horizontalPaint.backgroundPixels, 'resting horizontal edge matches the canvas').toBe(horizontalPaint.totalPixels)
      await shell.hover({ position: { x: 300, y: 300 } })
      await page.waitForTimeout(300)
      expect((await measureScrollbarPaint(shell)).thumbPixels, 'hovered shell thumb paints the hairline').toBeGreaterThan(0)
      expect((await measureScrollbarPaint(probe)).thumbPixels, 'unhovered child stays clear').toBe(0)
      await probe.hover()
      await page.waitForTimeout(300)
      expect((await measureScrollbarPaint(probe)).thumbPixels, 'hovered thin thumb paints the hairline').toBeGreaterThan(0)
      expect((await measureScrollbarPaint(probe, 'horizontal')).thumbPixels, 'hovered horizontal thumb paints').toBeGreaterThan(0)
      expect((await measureScrollbarPaint(page.locator('[data-scroll-sibling]'))).thumbPixels, 'unhovered sibling stays clear').toBe(0)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(300)
      const afterHover = await measureScrollbarPaint(shell)
      expect(afterHover.backgroundPixels, 'leaving clears the shell thumb').toBe(afterHover.totalPixels)
      await shell.evaluate((element) => { element.scrollTop = 120 })
      expect(await shell.evaluate((element) => element.scrollTop)).toBe(120)
      await probe.evaluate((element) => { element.scrollTop = 40; element.scrollLeft = 40 })
      expect(await probe.evaluate((element) => [element.scrollTop, element.scrollLeft])).toEqual([40, 40])
    } finally { await page.close(); view.unmount() }
  })

  it.each(['dark', 'light'] as const)('keeps touch hover clear and keyboard scrolling reachable in %s', async (mode) => {
    const page = await browser.newPage({ viewport: { width: 600, height: 706 }, hasTouch: true, isMobile: true, colorScheme: mode })
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${theme}}</style><div tabindex="0" data-scroll-probe style="overflow:auto;scrollbar-gutter:stable;width:200px;height:100px;background:var(--bg)"><div style="height:1600px"></div></div>`)
      const probe = page.locator('[data-scroll-probe]')
      expect(await probe.evaluate(measureScrollbarGutter)).toBe(4)
      await probe.tap()
      expect(await probe.evaluate((element) => element.matches(':hover'))).toBe(true)
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
      await page.waitForTimeout(300)
      const paint = await measureScrollbarPaint(probe)
      expect(paint.backgroundPixels).toBe(paint.totalPixels)
      await probe.focus()
      await page.keyboard.press('End')
      await expect.poll(() => probe.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    } finally { await page.close() }
  })

  it.each(['dark', 'light'] as const)('retains hover feedback with reduced motion in %s', async (mode) => {
    const page = await browser.newPage({ viewport: { width: 600, height: 706 }, reducedMotion: 'reduce', colorScheme: mode })
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${theme}}</style><div data-scroll-probe style="overflow:auto;scrollbar-gutter:stable;width:200px;height:100px;background:var(--bg)"><div style="height:1600px"></div></div>`)
      const probe = page.locator('[data-scroll-probe]')
      await page.mouse.move(300, 300)
      const paint = await measureScrollbarPaint(probe)
      expect.soft(paint.backgroundPixels).toBe(paint.totalPixels)
      expect(await probe.evaluate((element) => parseFloat(getComputedStyle(element, '::-webkit-scrollbar-thumb').transitionDuration))).toBeLessThan(0.001)
      await probe.hover()
      expect((await measureScrollbarPaint(probe)).thumbPixels).toBeGreaterThan(0)
      await page.mouse.move(300, 300)
      const afterHover = await measureScrollbarPaint(probe)
      expect(afterHover.backgroundPixels).toBe(afterHover.totalPixels)
    } finally { await page.close() }
  })
})
