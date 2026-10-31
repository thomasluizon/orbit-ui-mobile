import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browser: Browser
let launch: BrowserLaunch | undefined
let script: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(() => {
  script = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build({ entryPoints: ['./__tests__/support/habit-list-scroll-anchor-fixture.tsx'],
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' } });
    process.stdout.write(result.outputFiles[0].text);
  `]).toString()
})
afterAll(async () => { await closeChrome(launch) })

it.each([320, 412, 1024, 1440])('reaches the real end without growing the list at width %s', async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 915 } })
  try {
    await page.setContent('<!doctype html><div id="root"></div>')
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 200)
    const observed = await page.locator('[data-shell-scroller]').evaluate(async (element) => {
      const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()))
      await frame()
      await frame()
      const initialHeight = element.scrollHeight
      const heights: number[] = []
      const steps = Math.ceil((initialHeight - element.clientHeight) / 120) + 2
      for (let step = 0; step < steps; step++) {
        element.scrollTop += 120
        await frame()
        await frame()
        heights.push(element.scrollHeight)
      }
      const viewport = element.getBoundingClientRect()
      const lastRow = element.querySelector('[data-row="199"]')!.getBoundingClientRect()
      const footer = element.querySelector('[data-footer]')!.getBoundingClientRect()
      return { initialHeight, heights, offset: element.scrollTop, viewportHeight: element.clientHeight,
        lastRowVisible: lastRow.top >= viewport.top && lastRow.bottom <= viewport.bottom,
        footerVisible: footer.top >= viewport.top && footer.bottom <= viewport.bottom }
    })
    expect(new Set(observed.heights)).toEqual(new Set([observed.initialHeight]))
    expect(observed.offset).toBe(observed.initialHeight - observed.viewportHeight)
    expect(observed.lastRowVisible).toBe(true)
    expect(observed.footerVisible).toBe(true)
  } finally { await page.close() }
})

it.each(['no-preference', 'reduce'] as const)('holds the offset when rows leave and releases space while scrolling up, motion=%s', async (reducedMotion) => {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion })
  try {
    await page.setContent('<!doctype html><div id="root"></div>')
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 200)
    await page.locator('[data-shell-scroller]').evaluate(async (element) => {
      element.scrollTop = 10500
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    })
    const observations = page.locator('[data-shell-scroller]').evaluate((element) => new Promise<number[]>((done) => {
      const offsets: number[] = []
      const start = performance.now()
      const sample = () => {
        offsets.push(element.scrollTop)
        if (performance.now() - start > 800) done(offsets)
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }))
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('button')!.click())
    expect((await observations).every((offset) => offset === 10500)).toBe(true)
    expect(await page.locator('[data-row]').count()).toBe(20)
    await page.locator('[data-shell-scroller]').evaluate((element) => { element.scrollTop = 0 })
    await page.waitForFunction(() => document.querySelector('[data-shell-scroller]')!.scrollHeight === 1376)
  } finally { await page.close() }
})
