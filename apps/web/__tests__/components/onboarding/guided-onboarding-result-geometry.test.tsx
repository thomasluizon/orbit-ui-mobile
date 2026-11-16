import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GuidedOnboardingResult } from '@/components/onboarding/guided-onboarding-result'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, compileAppStylesheet, stubViewportMedia } from '@/__tests__/support/flow-layout'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'

vi.mock('@/hooks/use-habit-queries', () => ({ useHabitDetail: () => ({ data: undefined, isError: true, isFetching: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string | null | undefined) => time ?? '' }) }))

const WIDTH = 320
const HEIGHT = 780

describe('onboarding result read error geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(FLOW_LOCALES)('puts the read error message 72 under Orbit at 320 px in %s', async (locale) => {
    stubViewportMedia(WIDTH)
    const messages = locale === 'en' ? en : ptBR
    const view = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <GuidedOnboardingResult habitId="habit-1" signedOut={false} timeZone="UTC" onPrimary={vi.fn()} onClose={vi.fn()} />
    </NextIntlClientProvider>)
    await screen.findByRole('dialog', { name: messages.onboarding.flow.done.readFailed })
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: WIDTH, height: HEIGHT } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('[data-onboarding-result-error]')!
        const mascot = panel.querySelector('[data-asset="orbit-mascot"]')!.getBoundingClientRect()
        const message = panel.querySelector('[role="alert"] p')!
        return { mascotBottom: mascot.bottom, messageTop: message.getBoundingClientRect().top, message: message.textContent }
      })
      expect(geometry.message).toBe(messages.onboarding.flow.done.readFailed)
      expect(Math.abs(geometry.messageTop - geometry.mascotBottom - 72), JSON.stringify(geometry)).toBeLessThanOrEqual(0.5)
    } finally { await page.close(); view.unmount() }
  }, 60_000)
})
