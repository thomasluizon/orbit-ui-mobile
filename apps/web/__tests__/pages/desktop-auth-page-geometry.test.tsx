import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { desktopAuthPage } from '@/lib/desktop-auth-page'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 360, 384, 412, 1280].flatMap(width =>
  (['en', 'pt-BR'] as const).flatMap(locale =>
    (['light', 'dark'] as const).flatMap(mode => [false, true].map(failed => ({ width, locale, mode, failed }))),
  ),
)

describe('desktop completion page geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('follows the card radius token on the standalone page', async () => {
    const result = await desktopAuthPage(new URL('org.useorbit.desktop://auth/callback?error=authentication_failed'), 'en', 'dark')
    const document = new DOMParser().parseFromString(await new Response(result.body).text(), 'text/html')
    document.querySelector('script')?.remove()
    const page = await browser.newPage({ viewport: { width: 1280, height: 915 } })
    try {
      await page.setContent(document.documentElement.outerHTML)
      const radii = await page.evaluate(() => {
        const panel = document.querySelector('[data-field-surface="responsive-card"]')!
        const initial = getComputedStyle(panel).borderRadius
        document.documentElement.style.setProperty('--r-card', '28px')
        return { initial, overridden: getComputedStyle(panel).borderRadius }
      })
      expect(radii.initial).toBe('20px')
      expect(radii.overridden).toBe('28px')
    } finally { await page.close() }
  })

  it.each([false, true])('opens the rendered action automatically after load, failure %s', async failed => {
    const result = await desktopAuthPage(new URL(`org.useorbit.desktop://auth/callback?state=${'a'.repeat(64)}&${failed ? 'error=authentication_failed' : `code=${'c'.repeat(64)}`}`), 'en', 'dark', 'proxy-nonce')
    const document = new DOMParser().parseFromString(await new Response(result.body).text(), 'text/html')
    const interceptedDestination = `https://native.invalid/${failed ? 'failure' : 'success'}`
    document.querySelector('a')!.href = interceptedDestination
    const page = await browser.newPage()
    try {
      await page.route('**/*', route => route.fulfill({ status: 200, body: '' }))
      const navigation = page.waitForRequest(interceptedDestination)
      await page.setContent(document.documentElement.outerHTML, { waitUntil: 'domcontentloaded' })
      expect((await navigation).url()).toBe(interceptedDestination)
    } finally { await page.close() }
  })

  it.each(cases)('centres completion content with one focus indicator and whole labels at $width in $locale, $mode, failure $failed', async ({ width, locale, mode, failed }) => {
    const destination = new URL(`org.useorbit.desktop://auth/callback?state=${'a'.repeat(64)}&${failed ? 'error=authentication_failed' : `code=${'c'.repeat(64)}`}`)
    const result = await desktopAuthPage(destination, locale, mode)
    const document = new DOMParser().parseFromString(await new Response(result.body).text(), 'text/html')
    document.querySelector('script')?.remove()
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(document.documentElement.outerHTML)
      await page.evaluate(async () => { await document.fonts.ready })
      await page.keyboard.press('Tab')
      const geometry = await page.evaluate(() => {
        const action = document.querySelector('a')!
        const heading = document.querySelector('h1')!
        const body = document.querySelector('p')!
        const mark = document.querySelector('[data-asset="orbit-mark-accent"]')!
        const panel = document.querySelector('[data-field-surface="responsive-card"]')!.getBoundingClientRect()
        const panelCentre = panel.left + panel.width / 2
        const centreOffsets = Object.fromEntries(Object.entries({ mark, heading, body, action }).map(([name, element]) => {
          const bounds = element.getBoundingClientRect()
          return [name, Math.abs(bounds.left + bounds.width / 2 - panelCentre)]
        }))
        const style = getComputedStyle(action)
        const target = getComputedStyle(action, '::after')
        const actionText = document.createRange()
        actionText.selectNodeContents(action.querySelector('span')!)
        const headingText = document.createRange()
        headingText.selectNodeContents(heading)
        return {
          centreOffsets,
          headingAlignment: getComputedStyle(heading).textAlign, bodyAlignment: getComputedStyle(body).textAlign,
          actionBoxWidth: action.getBoundingClientRect().width, panelWidth: panel.width,
          focused: document.activeElement === action,
          outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow,
          headingLines: headingText.getClientRects().length, actionLines: actionText.getClientRects().length,
          headingWidth: headingText.getBoundingClientRect().width, headingAvailable: heading.getBoundingClientRect().width,
          actionWidth: actionText.getBoundingClientRect().width, actionAvailable: action.clientWidth,
          targetHeight: action.getBoundingClientRect().height - parseFloat(target.top) - parseFloat(target.bottom),
          documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
          background: getComputedStyle(document.body).backgroundColor,
          marks: document.querySelectorAll('[data-asset="orbit-mark-accent"]').length,
        }
      })
      for (const [element, offset] of Object.entries(geometry.centreOffsets)) {
        expect(offset, `${element} horizontal centre`).toBeLessThanOrEqual(1)
      }
      expect(geometry.headingAlignment).toBe('center')
      expect(geometry.bodyAlignment).toBe('center')
      expect(geometry.actionBoxWidth).toBeLessThan(geometry.panelWidth / 2)
      expect(geometry.focused).toBe(true)
      expect(geometry.outlineStyle).toBe('solid')
      expect(geometry.outlineWidth).toBe('2px')
      expect(geometry.boxShadow).toBe('none')
      expect(geometry.headingLines).toBe(1)
      expect(geometry.actionLines).toBe(1)
      expect(geometry.headingWidth).toBeLessThanOrEqual(geometry.headingAvailable)
      expect(geometry.actionWidth).toBeLessThanOrEqual(geometry.actionAvailable)
      expect(geometry.targetHeight).toBeGreaterThanOrEqual(48)
      expect(geometry.documentWidth).toBe(geometry.viewportWidth)
      expect(geometry.background).toBe(mode === 'dark' ? 'rgb(9, 9, 11)' : 'rgb(250, 250, 250)')
      expect(geometry.marks).toBe(1)
    } finally { await page.close() }
  })
})
