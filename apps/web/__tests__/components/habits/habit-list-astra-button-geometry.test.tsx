import { afterAll, beforeAll, expect, it } from 'vitest'
import { SPACING } from '@orbit/shared/theme'
import { measureShellScrollEnd } from '@/e2e/layout/shell-scroll-extent'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { buildHabitListScrollAssets } from '@/__tests__/support/habit-list-scroll-assets'

let browser: Browser
let launch: BrowserLaunch | undefined
let stylesheet: string
let script: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => { ({ stylesheet, script } = await buildHabitListScrollAssets()) }, 30_000)
afterAll(async () => { await closeChrome(launch) })

it.each([390, 840])('clears the stacked Astra button at the end of the real habit list at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://habit-list.test/', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><style>${stylesheet}</style><div id="root" data-count="100" data-astra></div>` }))
    await page.goto('https://habit-list.test/')
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 100)
    const button = page.locator('[data-astra-button]')
    await button.waitFor({ state: 'visible' })
    const resting = (await button.boundingBox())!
    for (const dragged of [false, true]) {
      if (dragged) {
        await page.mouse.move(resting.x + 30, resting.y + 30)
        await page.mouse.down()
        await page.mouse.move(resting.x + 30, 400, { steps: 8 })
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
      const measured = await page.locator('[data-shell-scroller]').evaluate(measureShellScrollEnd)
      const box = (await button.boundingBox())!
      expect(box, JSON.stringify({ dragged, box, resting })).toEqual(resting)
      expect(measured.lastTop).toBeGreaterThanOrEqual(measured.scrollerTop)
      expect(box.y - measured.lastBottom, JSON.stringify({ dragged, box, measured })).toBeGreaterThanOrEqual(SPACING.s16 - 1)
      expect(measured.scrollerBottom - measured.lastBottom).toBeCloseTo(measured.padding, 0)
      expect(await page.locator('[data-composer-root]').count()).toBe(0)
      expect(await page.locator('[data-shell-conversation]').count()).toBe(0)
    }
  } finally { await page.close() }
})
