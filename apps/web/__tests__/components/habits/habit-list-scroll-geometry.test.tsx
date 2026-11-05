import { afterAll, beforeAll, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { SPACING } from '@orbit/shared/theme'
import { measureShellScrollEnd, shellScrollViewports } from '@/e2e/layout/shell-scroll-extent'
import { settleAnimations } from '@/e2e/layout/settle-animations'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { buildHabitListScrollAssets } from '@/__tests__/support/habit-list-scroll-assets'
import { observeBulkSkip } from '@/__tests__/support/habit-list-scroll-observation'

let browser: Browser
let launch: BrowserLaunch | undefined
let stylesheet: string
let script: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => { ({ stylesheet, script } = await buildHabitListScrollAssets()) }, 30_000)
afterAll(async () => { await closeChrome(launch) })

it.each(shellScrollViewports)('bounds Hoje after rows leave at $width x $height', async ({ width, height }) => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(3000)
  try {
    await page.route('https://habit-list.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>${stylesheet}</style><div id="root"></div>` }))
    await page.goto('https://habit-list.test/')
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 30)
    await page.locator('[data-habit-row-control="menu"]').first().click()
    await page.getByRole('menuitem', { name: en.common.select, exact: true }).click()
    for (let index = 0; index < 9; index++) {
      const control = page.locator('[data-habit-row-control="selection"][aria-pressed="false"]').first()
      await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await control.click()
    }
    await page.locator('[data-shell-scroller]').evaluate(measureShellScrollEnd)
    await page.getByRole('button', { name: 'Skip selected', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 20)
    const measured = await page.locator('[data-shell-scroller]').evaluate(measureShellScrollEnd)
    process.stdout.write(`${JSON.stringify({ width, height, ...measured })}\n`)
    expect(measured.scrollerBottom - measured.lastBottom, JSON.stringify(measured)).toBeCloseTo(width >= 1024 ? SPACING.s32 : SPACING.s96, 0)
  } finally { await page.close() }
})

it.each(([
  { reducedMotion: 'no-preference', width: 412, height: 915, fontScale: 1 },
  { reducedMotion: 'reduce', width: 412, height: 915, fontScale: 1 },
  { reducedMotion: 'no-preference', width: 915, height: 412, fontScale: 1 },
  { reducedMotion: 'reduce', width: 915, height: 412, fontScale: 1 },
  { reducedMotion: 'no-preference', width: 915, height: 412, fontScale: 2 },
  { reducedMotion: 'reduce', width: 915, height: 412, fontScale: 2 },
] as const).flatMap((viewport) => (['pointer', 'keyboard'] as const).flatMap((activation) => [0, 1000].map((frameDelay) => ({ ...viewport, activation, frameDelay })))))('anchors real HabitList bulk skips via $activation, motion=$reducedMotion at $width x $height and $fontScale text, frame delay=$frameDelay', async ({ reducedMotion, width, height, fontScale, activation, frameDelay }) => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.route('https://habit-list.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>${stylesheet}</style><body class="font-sans"><div id="root"></div></body>` }))
    await page.goto('https://habit-list.test/')
    await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%` }, fontScale)
    await page.addScriptTag({ content: script })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 30, undefined, { timeout: 5000 })
      .catch(async (cause: unknown) => { throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText() }), { cause }) })
    const trigger = page.locator('[data-habit-row-control="menu"]').first()
    if (activation === 'pointer') await trigger.click()
    else { await trigger.focus(); await page.keyboard.press('Enter') }
    const menu = page.getByRole('menu')
    await menu.evaluate(settleAnimations)
    const menuItems = menu.getByRole('menuitem')
    expect(await menuItems.allTextContents()).toEqual([
      en.habits.actions.addSubHabit, en.habits.actions.moveUnder, en.habits.actions.skip,
      en.common.edit, en.habits.actions.duplicate, en.common.select, en.habits.actions.delete,
    ])
    for (const [index, item] of (await menuItems.all()).entries()) {
      if (activation === 'pointer') await item.scrollIntoViewIfNeeded()
      else {
        await page.keyboard.press(index === 0 ? 'Home' : 'ArrowDown')
        await expect.poll(() => item.evaluate((element) => document.activeElement === element)).toBe(true)
      }
      const reachable = await item.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        return bounds.top >= 0 && bounds.bottom <= innerHeight && (hit === element || element.contains(hit))
      })
      expect(reachable).toBe(true)
    }
    const select = menu.getByRole('menuitem', { name: 'Select', exact: true })
    if (activation === 'pointer') await select.click({ timeout: 3000 })
    else {
      await page.keyboard.press('ArrowUp')
      await expect.poll(() => select.evaluate((element) => document.activeElement === element)).toBe(true)
      await page.keyboard.press('Enter')
    }
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    const before = await page.locator('[data-shell-scroller]').evaluate(async (element) => {
      element.scrollTop = element.scrollHeight
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
      return { offset: element.scrollTop, maximum: element.scrollHeight - element.clientHeight, viewport: element.clientHeight, minimum: element.querySelector<HTMLElement>('[data-shell-page-content]')!.style.minHeight }
    })
    expect(before.offset).toBe(before.maximum)
    expect(before.offset).toBeGreaterThan(650)
    const observations = await page.locator('[data-shell-scroller]').evaluateHandle(observeBulkSkip, frameDelay)
    const skip = page.getByRole('button', { name: 'Skip selected', exact: true })
    if (activation === 'pointer') await skip.click()
    else { await skip.focus(); await page.keyboard.press('Enter') }
    const observed = await observations.evaluate((observation) => observation.finished)
    await observations.dispose()
    expect(observed.departures, JSON.stringify({ observed, errors })).toBe(30)
    expect(observed.remaining).toBe(0)
    expect(observed.offsets.some(sample => sample.departing)).toBe(true)
    expect(observed.offsets.filter(sample => sample.departing).every(sample => Math.abs(sample.offset - before.offset) < 1), JSON.stringify({ before, observed })).toBe(true)
    expect(observed.offsets.at(-1)!.offset).toBe(observed.maximum)
    if (height > width) expect(observed.offsets.at(-1)!.offset, JSON.stringify(observed)).toBe(0)
    expect(observed.maximum).toBeLessThan(650)
    await page.locator('[data-shell-scroller]').evaluate((element) => { element.scrollTop = 0 })
    await page.waitForFunction(() => {
      const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
      return scroller.scrollTop === 0 && scroller.querySelector<HTMLElement>('[data-shell-page-content]')!.clientHeight <= Math.max(scroller.clientHeight, scroller.querySelector<HTMLElement>('#orbit-main')!.clientHeight)
    }, undefined, { timeout: 5000 })
    expect(errors).toEqual([])
  } finally { await page.close() }
})


it.each(shellScrollViewports.flatMap(viewport => (['today', 'all'] as const).map(view => ({ ...viewport, view }))))(
  'bounds the mounted Hoje $view scroll extent at $width x $height', async ({ width, height, view }) => {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.route('https://habit-list.test/', route => route.fulfill({ contentType: 'text/html',
        body: `<!doctype html><style>${stylesheet}</style><div id="root" data-count="100"></div>` }))
      await page.goto('https://habit-list.test/')
      await page.addScriptTag({ content: script })
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 100)
      if (view === 'all') {
        await page.getByRole('radio', { name: en.habits.viewAll, exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 100)
      }
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.locator('[data-shell-scroller]').evaluate(measureShellScrollEnd)
      const evidence = JSON.stringify(geometry)
      expect(geometry.scrollTop, evidence).toBeGreaterThan(0)
      expect(geometry.scrollTop, evidence).toBe(geometry.scrollHeight - geometry.clientHeight)
      expect(geometry.lastTop, evidence).toBeGreaterThanOrEqual(geometry.scrollerTop)
      expect(geometry.scrollerBottom - geometry.lastBottom, evidence).toBeCloseTo(width >= 1024 ? SPACING.s32 : SPACING.s96, 0)
      expect(errors).toEqual([])
    } finally { await page.close() }
  },
)
