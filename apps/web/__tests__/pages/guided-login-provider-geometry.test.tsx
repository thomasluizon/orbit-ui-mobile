import { cleanup, render } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { authLocales, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { compileAppStylesheet, stubViewportMedia } from '@/__tests__/support/flow-layout'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/components/auth/guided-sign-in', () => ({ useGuidedSignIn: () => true }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: vi.fn(), captureGuidedFlowEvent: vi.fn() }))

const cases = [412, 1440].flatMap((width) => authLocales.flatMap((locale) => [false, true].map((apple) => ({ width, locale, apple }))))

describe('the guided sign-in providers in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps the provider options at one shared size in the centre, at most 360 wide from 1024, at $width in $locale, Apple $apple', async ({ width, locale, apple }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', apple ? 'test-client' : '')
    stubViewportMedia(width)
    mocks.flow = { ...createLoginScreenFixture('email', locale), t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }) }
    const { container } = render(<LoginContent />)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      await page.setContent(`<!DOCTYPE html><html class="dark"><style>${stylesheet}</style><body style="margin:0"><div class="flex h-dvh flex-col">${container.innerHTML}</div></body></html>`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const column = document.querySelector('[data-question-flow] [data-flow-scroll] > [role="presentation"]')!.getBoundingClientRect()
        const box = (button: Element) => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height, centre: (rect.left + rect.right) / 2 } }
        return {
          columnCentre: (column.left + column.right) / 2,
          columnWidth: column.width,
          providers: [...document.querySelectorAll('[data-login-providers] button')].map(box),
          primary: box(document.querySelector('[data-flow-primary] button')!),
        }
      })
      expect(geometry.providers).toHaveLength(apple ? 2 : 1)
      const wide = width >= 1024
      for (const provider of geometry.providers) {
        expect(provider.width, 'the providers share one width').toBeCloseTo(geometry.providers[0]!.width, 1)
        expect(provider.height, 'the providers share one height').toBeCloseTo(geometry.providers[0]!.height, 1)
        expect(Math.abs(provider.centre - geometry.columnCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
        if (wide) expect(provider.width, `a provider never spans the content column: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(360)
        else expect(provider.width, 'the compact shell keeps the providers as wide as the column').toBeCloseTo(geometry.columnWidth, 1)
      }
      if (wide) expect(geometry.primary.width, JSON.stringify(geometry)).toBeLessThanOrEqual(360)
    } finally { await page.close() }
  }, 60_000)
})
