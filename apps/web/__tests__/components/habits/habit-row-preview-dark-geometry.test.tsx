import { assertHabitRowPreviewGeometry, compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('habit row standard in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    stylesheet = await compileHabitRowStylesheet()
  })
  afterAll(async () => { vi.unstubAllGlobals(); await closeChrome(browserLaunch) }, 30_000)

  it.each((['dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) =>
    [1, 2].flatMap((scale) => (['en', 'pt-BR'] as const).map((locale) => ({ mode, width, scale, locale }))),
  )))('measures preview, full-row feedback and centres in $mode at $width with $scale text in $locale', async (parameters) => {
    await assertHabitRowPreviewGeometry(browser, stylesheet, parameters)
  }, 30_000)
})
