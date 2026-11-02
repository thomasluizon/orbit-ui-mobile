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
  `], { maxBuffer: 8 * 1024 * 1024 }).toString()
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

it.each([1, 1.1].flatMap((zoom) => (['no-preference', 'reduce'] as const).map((reducedMotion) => ({ zoom, reducedMotion }))))(
  'holds the bulk removal offset while the viewport grows, zoom=$zoom motion=$reducedMotion', async ({ zoom, reducedMotion }) => {
    const page = await browser.newPage({ viewport: { width: 412, height: 1100 }, reducedMotion })
    try {
      page.setDefaultTimeout(3000)
      await page.setContent('<!doctype html><div id="root" data-count="30" data-remaining="0"></div>')
      await page.addScriptTag({ content: script })
      await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 30)
      const scroller = page.locator('[data-shell-scroller]')
      await scroller.evaluate(async (element) => {
        element.scrollTop = 650
        await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
      })
      const observations = scroller.evaluate((element) => new Promise<{ offset: number; maximum: number; viewport: number; minimum: string; departures: number }[]>((done) => {
        const samples: { offset: number; maximum: number; viewport: number; minimum: string; departures: number }[] = []
        let grownAt: number | undefined
        const sample = () => {
          samples.push({ offset: element.scrollTop, maximum: element.scrollHeight - element.clientHeight, viewport: element.clientHeight,
            minimum: (element.querySelector('[data-shell-page-content]') as HTMLElement).style.minHeight,
            departures: element.querySelectorAll('[data-list-motion][inert]').length })
          if (element.clientHeight === 832) grownAt ??= performance.now()
          if (grownAt !== undefined && performance.now() - grownAt > 300) done(samples)
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      }))
      await page.evaluate(() => document.querySelector<HTMLButtonElement>('button')!.click())
      await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 0)
      await page.evaluate((zoom) => { document.body.style.zoom = String(zoom); document.getElementById('grow-viewport')!.click() }, zoom)
      const samples = await observations
      expect(samples.every(({ offset }) => Math.abs(offset - 650) < 1), JSON.stringify(samples)).toBe(true)
      expect(await page.locator('[data-row]').count()).toBe(0)
      await scroller.evaluate((element) => { element.scrollTop = 240 })
      await page.waitForFunction(() => Math.abs(document.querySelector('[data-shell-scroller]')!.scrollTop - 240) < 1)
      await scroller.evaluate((element) => { element.scrollTop = 0 })
      await page.waitForFunction(() => document.querySelector('[data-shell-scroller]')!.scrollHeight === 832)
    } finally { await page.close() }
  },
)
