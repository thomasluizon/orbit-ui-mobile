import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { SupportForm } from '@/app/(app)/support/_components/support-form'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { expectLabelsFit, markUserText } from '@/e2e/layout/label-fit-contract'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const replyEmail = `${'W'.repeat(48)}@example.com`
const doNothing = () => {}

function supportMarkup(locale: 'en' | 'pt-BR', email: string) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === 'pt-BR' ? ptBR : en}>
      <SupportForm
        email={email} subject={null} message="" appVersion={null}
        messageMaxLength={5000} messageOverLimitHint={null} error={null}
        subjectError={null} messageError={null} isSending={false} isOnline
        disabled={false} disabledReason={null} subjectFocusRequest={0} messageFocusRequest={0}
        onSubjectChange={doNothing} onMessageChange={doNothing} onSubjectBlur={doNothing}
        onMessageBlur={doNothing} onSend={doNothing}
      />
    </NextIntlClientProvider>,
  )
}

describe('support form geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  for (const locale of ['pt-BR', 'en'] as const) {
    it.each([320, 360, 384, 412])(`keeps labels whole and reply text within two lines in ${locale} at %ipx`, async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.setContent(`<style>${stylesheet}body { padding: 24px; }</style>${supportMarkup(locale, replyEmail)}`)
        await loadAppFonts(page)
        await markUserText(page, [replyEmail])
        await expectLabelsFit(page, page.locator('form'), [replyEmail])
        const email = page.getByText(replyEmail, { exact: true })
        const geometry = await email.evaluate((element) => {
          const control = element.closest('button')!
          const style = getComputedStyle(control)
          const textStyle = getComputedStyle(element)
          return {
            width: element.getBoundingClientRect().width,
            available: control.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
            lines: element.clientHeight / Number.parseFloat(textStyle.lineHeight),
            clamp: textStyle.webkitLineClamp,
            clipped: element.scrollHeight > element.clientHeight,
          }
        })
        expect(geometry.width).toBeCloseTo(geometry.available, 0)
        expect(geometry.lines).toBeLessThanOrEqual(2)
        if (geometry.clipped) expect(geometry.clamp).toBe('2')
        for (const mode of ['light', 'dark'] as const) {
          const variables = resolveWebThemeVariables('purple', mode)
          expect(contrastOnSurface(variables['--fg-1']!, [variables['--bg']!, variables['--bg-well']!])).toBeGreaterThanOrEqual(4.5)
          expect(contrastOnSurface(variables['--fg-2']!, [variables['--bg']!, variables['--bg-well']!])).toBeGreaterThanOrEqual(4.5)
        }
      } finally {
        await page.close()
      }
    })
  }
})
