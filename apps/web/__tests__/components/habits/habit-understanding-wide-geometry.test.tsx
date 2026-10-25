import { cases, compileHabitUnderstandingGeometry, expectHabitUnderstandingGeometry } from '@/__tests__/support/habit-understanding-geometry'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('habit understanding geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    stylesheet = await compileHabitUnderstandingGeometry()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases.filter(({ width }) => width >= 393))('fits $cadence corrections in $locale at $width with text scale $scale', async (scenario) => {
    await expectHabitUnderstandingGeometry(browser, stylesheet, scenario)
  })
})
