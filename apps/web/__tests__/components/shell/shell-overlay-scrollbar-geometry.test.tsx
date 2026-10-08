import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShellWide } from '@/components/shell/shell-wide'
import { measureScrollbarGutter } from '@/e2e/layout/scrollbar-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Platform overlay scrollbars', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch }, {
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--enable-features=OverlayScrollbar'],
  })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([1352, 1100, 600])('keeps both scroll axes over the content at %ipx', async (width) => {
    const view = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
      header={<button type="button">Header</button>}
      notice={<div>Notice</div>} composer={<button type="button">Composer</button>}
      tabBar={<nav>Tabs</nav>} fab={<button type="button">Create</button>}>
      <div style={{ height: 1600 }}>
        <div data-scroll-probe="" className="thin-scrollbar" style={{ overflow: 'auto', width: 200, height: 100, border: '1px solid' }}>
          <div style={{ width: 400, height: 200 }}>Scrollable content</div>
        </div>
      </div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 706 }, locale: 'pt-BR', colorScheme: 'dark' })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      const nativeProbe = await page.evaluate(() => {
        const host = document.createElement('div')
        const shadow = host.attachShadow({ mode: 'open' })
        shadow.innerHTML = '<div style="overflow:scroll;scrollbar-gutter:stable;width:100px;height:100px"><div style="height:200px;width:200px"></div></div>'
        document.body.append(host)
        const probe = shadow.querySelector<HTMLElement>('div')!
        const gutter = probe.offsetWidth - probe.clientWidth
        host.remove()
        return gutter
      })
      expect(nativeProbe, 'the platform provides native overlay scrollbars').toBe(0)
      const scrollers = page.locator('[data-shell-scroller], [data-shell-header], [data-shell-notice], [data-shell-pinned-slot], [data-shell-fab-clip], [data-scroll-probe]')
      expect(await scrollers.count()).toBe(6)
      for (const scroller of await scrollers.all()) {
        expect.soft(await scroller.evaluate(measureScrollbarGutter), 'vertical gutter').toBe(0)
        expect.soft(await scroller.evaluate((element: HTMLElement) => {
          const style = getComputedStyle(element)
          return element.offsetHeight - element.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)
        }), 'horizontal gutter').toBe(0)
      }
      expect(await page.locator('[data-scroll-probe]').evaluate((element) => getComputedStyle(element).paddingBottom)).toBe('0px')
      await page.locator('[data-shell-scroller]').evaluate((element) => { element.scrollTop = 120 })
      expect(await page.locator('[data-shell-scroller]').evaluate((element) => element.scrollTop)).toBe(120)
      await page.locator('[data-scroll-probe]').evaluate((element) => { element.scrollTop = 40; element.scrollLeft = 40 })
      expect(await page.locator('[data-scroll-probe]').evaluate((element) => [element.scrollTop, element.scrollLeft])).toEqual([40, 40])
    } finally { await page.close(); view.unmount() }
  })
})
