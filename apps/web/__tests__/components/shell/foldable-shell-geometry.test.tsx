import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShellWide } from '@/components/shell/shell-wide'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const windows = ([[360, 740], [412, 915], [480, 800], [600, 900], [840, 900], [1100, 900]] as const)
  .flatMap(([width, height]) => [{ width, height }, { width: height, height: width }])

describe('Foldable shell geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(windows)('centres content and chrome at $width by $height', async ({ width, height }) => {
    const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
      header={<h1>Screen</h1>} composer={<button type="button">Composer</button>}
      tabBar={<nav>Tabs</nav>} fab={<button type="button">Create</button>}>
      <div style={{ height: 1600 }}>Long screen</div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        const column = scroller.parentElement!
        const available = column.parentElement!.getBoundingClientRect()
        const content = column.getBoundingClientRect()
        scroller.scrollTop = scroller.scrollHeight
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        const last = scroller.lastElementChild!.getBoundingClientRect()
        const pinned = document.querySelector('[data-shell-pinned-slot]')!.getBoundingClientRect()
        return {
          availableWidth: available.width, width: content.width,
          leftGap: content.left - available.left, rightGap: available.right - content.right,
          documentWidth: document.documentElement.scrollWidth,
          scrollerWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
          clearance: bottom.top - last.bottom, pinnedLeft: pinned.left, columnLeft: content.left,
          pinnedWidth: pinned.width, bottom: bottom.bottom,
        }
      })
      expect(bounds.width).toBeLessThanOrEqual(740)
      if (width < 1024) expect(bounds.width).toBe(Math.min(width, 740))
      expect(Math.abs(bounds.leftGap - bounds.rightGap)).toBeLessThanOrEqual(1)
      expect(bounds.documentWidth).toBe(width)
      expect(bounds.scrollerWidth).toBe(bounds.clientWidth)
      expect(bounds.pinnedLeft).toBe(bounds.columnLeft)
      expect(bounds.pinnedWidth).toBe(bounds.width)
      expect(bounds.clearance).toBeGreaterThanOrEqual(width < 1024 ? 95 : 31)
      expect(bounds.bottom).toBeLessThanOrEqual(height)
    } finally { await page.close() }
  })

  it.each(windows.filter(({ width }) => width < 1024))('aligns the compact conversation at $width by $height', async ({ width, height }) => {
    const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
      conversation={<button type="button">Close conversation</button>} conversationLabel="Conversation" />)
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.locator('[data-shell-conversation="overlay"]').evaluate((element) => {
        const rectangle = element.getBoundingClientRect()
        return { width: rectangle.width, left: rectangle.left, right: rectangle.right, height: rectangle.height }
      })
      expect(bounds.width).toBe(Math.min(width, 740))
      expect(bounds.left).toBe((width - bounds.width) / 2)
      expect(bounds.right).toBe(width - bounds.left)
      expect(bounds.height).toBe(height)
    } finally { await page.close() }
  })

})
