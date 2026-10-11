import { afterAll, describe, expect, it } from 'vitest'
import { expect as expectLayout } from '@playwright/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { FailureScreen } from '@/components/ui/failure-screen'
import { ErrorState } from '@/components/ui/error-state'
import { inspectDestinationHeading } from '../../e2e/layout/destination-heading'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '../support/chromium'

function failureMarkup() {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>
    <FailureScreen error={new Error('Calendar render failed')} retry={() => {}} />
  </NextIntlClientProvider>)
}

describe('layout destination heading', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  afterAll(async () => { await closeChrome(browserLaunch) })

  it('reproduces the first heading locator accepting the focused route error title', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<main data-shell-scroller>${failureMarkup()}</main>`)
      const heading = page.locator('[data-shell-header] h1, [data-shell-scroller] h1').first()
      await heading.evaluate((element) => { (element as HTMLElement).tabIndex = -1 })
      await heading.focus()
      await expectLayout(heading).toBeFocused()
      expect(await page.locator('.error-surface').count()).toBe(1)
      expect(await heading.textContent()).toBe(ptBR.errorScreen.title)
    } finally {
      await page.close()
    }
  })

  it('rejects the real error surface even when its heading name matches', async () => {
    const page = await browser.newPage()
    try {
      await expect(inspectDestinationHeading(page, '/calendar', ptBR.errorScreen.title,
        async () => {}, () => page.setContent(failureMarkup())))
        .rejects.toThrow('Route /calendar rendered .error-surface')
    } finally {
      await page.close()
    }
  })

  it('accepts the destination by accessible name rather than its text or heading order', async () => {
    const page = await browser.newPage()
    try {
      await inspectDestinationHeading(page, '/calendar', ptBR.nav.calendar, async (heading) => {
        expect(await heading.textContent()).toBe('Month view')
      }, () => page.setContent(`<h1>Other destination</h1><h1 aria-label="${ptBR.nav.calendar}">Month view</h1>`))
    } finally {
      await page.close()
    }
  })

  it('rejects a rendered route error state alongside the matching heading', async () => {
    const page = await browser.newPage()
    try {
      const markup = renderToStaticMarkup(<><h1>{ptBR.nav.calendar}</h1><ErrorState message={ptBR.common.error} /></>)
      await expect(inspectDestinationHeading(page, '/calendar', ptBR.nav.calendar,
        async () => {}, () => page.setContent(markup)))
        .rejects.toThrow('Route /calendar rendered an error state')
    } finally {
      await page.close()
    }
  })

  it('rejects a heading with another name', async () => {
    const page = await browser.newPage()
    try {
      page.setDefaultTimeout(100)
      await expect(inspectDestinationHeading(page, '/calendar', ptBR.nav.calendar,
        async () => {}, () => page.setContent(`<h1>${ptBR.nav.profile}</h1>`)))
        .rejects.toThrow(`Route /calendar expected heading "${ptBR.nav.calendar}"`)
    } finally {
      await page.close()
    }
  })

  it('rejects an error surface that replaces a heading during the focus inspection', async () => {
    const page = await browser.newPage()
    try {
      await expect(inspectDestinationHeading(page, '/calendar', ptBR.nav.calendar, async (heading) => {
        await heading.focus()
        await page.setContent(failureMarkup())
        await page.getByRole('heading', { name: ptBR.nav.calendar, exact: true }).waitFor({ timeout: 2000 })
      }, () => page.setContent(`<h1 tabindex="-1">${ptBR.nav.calendar}</h1>`)))
        .rejects.toThrow('Route /calendar rendered .error-surface')
    } finally {
      await page.close()
    }
  })

  it('rejects an uncaught route error while waiting for the destination', async () => {
    const page = await browser.newPage()
    try {
      await expect(inspectDestinationHeading(page, '/calendar', ptBR.nav.calendar,
        async () => {}, () => page.setContent('<script>throw new Error("Calendar render failed")</script>')))
        .rejects.toThrow('Route /calendar raised an error: Calendar render failed')
    } finally {
      await page.close()
    }
  })

  it('rejects an uncaught route error after the heading has appeared', async () => {
    const page = await browser.newPage()
    try {
      await expect(inspectDestinationHeading(page, '/calendar', ptBR.nav.calendar, async () => {
        await page.evaluate(() => { setTimeout(() => { throw new Error('Calendar render failed') }, 0) })
        await page.waitForFunction(() => false, undefined, { timeout: 2000 })
      }, () => page.setContent(`<h1>${ptBR.nav.calendar}</h1>`)))
        .rejects.toThrow('Route /calendar raised an error: Calendar render failed')
    } finally {
      await page.close()
    }
  })
})
