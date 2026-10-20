import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { settleAnimations } from '@/e2e/layout/settle-animations'
import { prepareAnimationSettlementScenario } from '@/e2e/layout/animation-settlement-scenario'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

describe('animation settlement in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['cancel', 'replace', 'replay'] as const)('settles a transition after %s', async (mode) => {
    const page = await browser.newPage()
    try {
      expect(await page.evaluate(prepareAnimationSettlementScenario, mode)).toEqual({ kind: 'CSSTransition', state: 'running' })
      const scope = page.locator('#animation-settlement')
      await scope.evaluate(settleAnimations)
      expect(await scope.getAttribute('data-settled')).toBe('true')
      expect(Number(await scope.getAttribute('data-reads'))).toBeGreaterThanOrEqual(mode === 'cancel' ? 2 : 3)
    } finally {
      await page.close()
    }
  })

  it('waits for descendants while leaving animations outside the scope running', async () => {
    const page = await browser.newPage()
    try {
      await page.evaluate(() => {
        document.body.innerHTML = '<div id="scope"><div id="inside"></div></div><div id="outside"></div>'
        document.querySelector('#inside')!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, fill: 'forwards' })
        document.querySelector('#outside')!.animate([{ opacity: 0 }, { opacity: 1 }], 60_000)
      })
      await page.locator('#scope').evaluate(settleAnimations)
      expect(await page.locator('#inside').evaluate((element) => element.getAnimations().map((animation) => animation.playState)))
        .toEqual(['finished'])
      expect(await page.locator('#outside').evaluate((element) => element.getAnimations().map((animation) => animation.playState)))
        .toEqual(['running'])
    } finally {
      await page.close()
    }
  })

  it('waits for document animations to finish naturally', async () => {
    const page = await browser.newPage()
    try {
      await page.evaluate(() => {
        document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, fill: 'forwards' })
      })
      await page.evaluate(settleAnimations, undefined)
      expect(await page.evaluate(() => document.getAnimations().map((animation) => animation.playState)))
        .toEqual(['finished'])
    } finally {
      await page.close()
    }
  })

  it('settles an empty document', async () => {
    const page = await browser.newPage()
    try {
      await page.evaluate(settleAnimations, undefined)
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    } finally {
      await page.close()
    }
  })
})
