import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShellWide } from '@/components/shell/shell-wide'
import { NotFoundContent } from '@/components/ui/not-found-content'
import { Toast } from '@/components/ui/toast'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { useUIStore } from '@/stores/ui-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const windows = ([[360, 740], [412, 915], [480, 800], [600, 900], [840, 900], [1100, 900]] as const)
  .flatMap(([width, height]) => [{ width, height }, { width: height, height: width }])

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

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

  it.each([320, 412, 500, 740, 1024, 1352])('aligns feedback and not-found content without reserving composer space at %ipx', async (width) => {
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    const { container } = render(<ShellWide items={[]} activeId="" navLabel="Navigation"
      notice={<><CelebrationPanel /><Toast kind="neutral" message="Notification removed" /></>}
      tabBar={<nav style={{ height: 64 }}>Tabs</nav>}>
      <NotFoundContent inShell />
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.evaluate(() => {
        const column = document.querySelector('[data-shell-column]')!
        const rectangle = column.getBoundingClientRect()
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        scroller.scrollTop = scroller.scrollHeight
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        const last = scroller.lastElementChild!.getBoundingClientRect()
        const edges = (element: Element) => {
          const box = element.getBoundingClientRect()
          return { left: box.left, right: box.right }
        }
        return {
          content: { left: rectangle.left + 16, right: rectangle.right - 16 },
          composerCount: document.querySelectorAll('[data-composer-root]').length,
          pinnedCount: document.querySelectorAll('[data-shell-pinned-slot]').length,
          padding: parseFloat(getComputedStyle(scroller).paddingBottom),
          clearance: bottom.top - last.bottom,
          toast: edges(document.querySelector('[data-shell-notice] [data-kind]')!),
          celebration: edges(document.querySelector('[data-celebration-panel]')!),
          title: edges(document.querySelector('[data-state="not-found"] h1')!),
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(bounds.composerCount).toBe(0)
      expect(bounds.pinnedCount).toBe(0)
      expect(bounds.padding).toBe(32)
      expect(bounds.clearance).toBeGreaterThanOrEqual(31)
      expect.soft(bounds.toast).toEqual(bounds.content)
      expect.soft(bounds.celebration).toEqual(bounds.content)
      expect.soft(bounds.title).toEqual(bounds.content)
      expect(bounds.documentWidth).toBe(width)
    } finally { await page.close() }
  })

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

  it.each([412, 1023, 1024, 1352])('clears navigation without reserving composer space at %ipx', async (width) => {
    const { container } = render(<ShellWide items={[]} activeId="calendario" navLabel="Navigation"
      tabBar={<nav style={{ height: 64 }}>Tabs</nav>}>
      <div style={{ height: 1600 }}>Long destination</div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        scroller.scrollTop = scroller.scrollHeight
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        const last = scroller.lastElementChild!.getBoundingClientRect()
        return {
          padding: parseFloat(getComputedStyle(scroller).paddingBottom),
          clearance: bottom.top - last.bottom,
          bottomHeight: bottom.height,
          bottom: bottom.bottom,
          pinnedCount: document.querySelectorAll('[data-shell-pinned-slot]').length,
        }
      })
      expect(geometry.pinnedCount).toBe(0)
      expect(geometry.padding).toBe(32)
      expect(geometry.clearance).toBeCloseTo(32, 0)
      expect(geometry.bottomHeight).toBe(width < 1024 ? 64 : 0)
      expect(geometry.bottom).toBe(915)
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
