import { afterAll, beforeAll, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { SPACING } from '@orbit/shared/theme'
import { measureShellScrollEnd, shellScrollViewports } from '@/e2e/layout/shell-scroll-extent'
import { closeChrome, registerChromeLaunchHook, setUpPage, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { buildHabitListScrollAssets } from '@/__tests__/support/habit-list-scroll-assets'

let browser: Browser
let launch: BrowserLaunch | undefined
let stylesheet: string
let script: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => { ({ stylesheet, script } = await buildHabitListScrollAssets()) }, 30_000)
afterAll(async () => { await closeChrome(launch) })

it.each(shellScrollViewports)('bounds Hoje after rows leave at $width x $height', async ({ width, height }) => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
  try {
    await setUpPage(page, 3000, async () => {
      await page.route('https://habit-list.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>${stylesheet}</style><div id="root"></div>` }))
      await page.goto('https://habit-list.test/')
      await page.addScriptTag({ content: script })
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 30)
    })
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
