import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Toast } from '@/components/ui/toast'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('shared toast geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412, 1352].flatMap(width => (['dark', 'light'] as const).flatMap(mode =>
    (['en', 'pt-BR'] as const).map(locale => ({ width, mode, locale })),
  )))('keeps every variant closeable and inside one frame at $width in $locale $mode', async ({ width, mode, locale }) => {
    const words = locale === 'en' ? en : ptBR
    const message = words.toast.errors.notFound
    const view = render(<NextIntlClientProvider locale={locale} messages={words} timeZone="UTC">
      <div style={{ padding: 16 }}>
        <Toast kind="neutral" message={message} />
        <Toast kind="neutral" message={message} actionLabel={words.notifications.deleteUndo} onAction={() => {}} />
        <Toast kind="neutral" message={message} actionLabel={words.common.retry} actionIcon="refresh" onAction={() => {}} />
        <Toast kind="working" message={message} />
        <Toast kind="done" message={message} onDone={() => {}} />
        <Toast kind="lost" message={message} detail={words.common.syncChangeDroppedDetail} actionLabel={words.common.retry} onAction={() => {}} />
        <Toast outlined kind="neutral" message={message} />
      </div>
    </NextIntlClientProvider>)
    const markup = view.container.innerHTML
    view.unmount()
    const page = await browser.newPage({ viewport: { width, height: 1200 } })
    try {
      await page.setContent(`<html class="${mode}"><style>${stylesheet}</style><body>${markup}</body></html>`)
      await loadAppFonts(page)
      const measurements = await page.locator('[data-kind]').evaluateAll((surfaces, closeLabel) => surfaces.map(surface => {
        const bounds = surface.getBoundingClientRect()
        const style = getComputedStyle(surface)
        const message = surface.querySelector<HTMLElement>('[data-toast-message]')!
        const type = getComputedStyle(message)
        const close = surface.querySelector<HTMLButtonElement>(`button[aria-label="${closeLabel}"]`)
        const target = close?.getBoundingClientRect()
        const hitPadding = close ? -parseFloat(getComputedStyle(close, '::after').left) : 0
        const controls = [...surface.querySelectorAll('button')].map(button => button.getBoundingClientRect())
        return {
          width: bounds.width, center: bounds.left + bounds.width / 2,
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          radius: style.borderRadius, columnGap: style.columnGap,
          fontSize: type.fontSize, lineHeight: type.lineHeight, fontWeight: type.fontWeight,
          closeName: close?.getAttribute('aria-label'), closeWidth: (target?.width ?? 0) + hitPadding * 2,
          closeHeight: (target?.height ?? 0) + hitPadding * 2,
          fits: controls.every(control => control.left >= bounds.left && control.right <= bounds.right),
          copyFits: message.scrollWidth <= message.clientWidth,
        }
      }), words.common.close)
      expect(measurements).toHaveLength(7)
      for (const measured of measurements) {
        expect(measured).toMatchObject({
          width: Math.min(width - 32, 420), center: width / 2,
          padding: ['16px', '16px', '16px', '16px'], radius: '20px', columnGap: '12px',
          fontSize: '14px', lineHeight: '20px', fontWeight: '500',
          closeName: words.common.close, closeWidth: 48, closeHeight: 48, fits: true, copyFits: true,
        })
      }
    } finally { await page.close() }
  })
})
