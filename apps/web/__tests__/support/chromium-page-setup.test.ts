import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, PAGE_SETUP_TIMEOUT_MS, registerChromeLaunchHook, setUpPage, type Browser, type BrowserLaunch } from './chromium'

const INTERACTION_TIMEOUT_MS = 3000
const HELD_LOAD_MS = INTERACTION_TIMEOUT_MS + 500

describe('Chromium page setup limit', () => {
  let browser: Browser
  let launch: BrowserLaunch | undefined
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it('lets a document load outlast the interaction limit and keeps that limit for the actions after it', async () => {
    expect(PAGE_SETUP_TIMEOUT_MS).toBeGreaterThan(HELD_LOAD_MS)
    const page = await browser.newPage()
    try {
      await page.route('https://page-setup.test/', (route) => route.fulfill({
        contentType: 'text/html',
        body: '<img src="https://page-setup.test/held.svg"><button>Continue</button>',
      }))
      await page.route('https://page-setup.test/held.svg', async (route) => {
        await new Promise((release) => setTimeout(release, HELD_LOAD_MS))
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />' })
      })
      const started = performance.now()
      await setUpPage(page, INTERACTION_TIMEOUT_MS, () => page.goto('https://page-setup.test/'))
      expect(performance.now() - started).toBeGreaterThanOrEqual(HELD_LOAD_MS)
      expect(await page.locator('img').evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true)
      await expect(page.locator('#absent').hover()).rejects.toThrow(`locator.hover: Timeout ${INTERACTION_TIMEOUT_MS}ms exceeded`)
    } finally { await page.close() }
  })
})
