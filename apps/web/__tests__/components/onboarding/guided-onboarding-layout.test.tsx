import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Page } from 'playwright-core'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

vi.mock('next/navigation', async (importOriginal) => ({ ...await importOriginal<typeof import('next/navigation')>(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', aiMessagesLimit: 5, aiMessagesUsed: 0 }, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: () => ({ available: false, mutateAsync: vi.fn(), verification: null, cancel: vi.fn() }) }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({ usePushNotificationPreferences: () => ({ supported: true, permission: 'default' }), subscribeToPushNotifications: vi.fn(), requestWebPushPermission: vi.fn() }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))

import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const LOCALES = [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const
const WIDTHS = [320, 360, 384, 412] as const
const HEIGHT = 667
const actions = { createHabit: vi.fn(), updateHabit: vi.fn(), createHabitsBulk: vi.fn(), logHabit: vi.fn(), createGoal: vi.fn(), setWeekStartDay: vi.fn(), deferPushRegistration: vi.fn(), recordCompletion: vi.fn(), finishOnboarding: vi.fn() } satisfies OnboardingActions

/** Each screen of the intro and the first question, as markup, rendered still so the measure reads the resting layout. */
function captureScreens(locale: string, messages: typeof en): string[] {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  useOnboardingDraftStore.setState({ introSeen: false })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        <OnboardingActionsProvider actions={actions} isLive={false}><OnboardingFlow guided /></OnboardingActionsProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
  const screens: string[] = []
  for (let index = 0; index < 4; index += 1) {
    screens.push(document.querySelector('[data-question-flow]')!.outerHTML)
    if (index < 3) fireEvent.click(screen.getByRole('button', { name: messages.onboarding.flow.continue }))
  }
  cleanup()
  vi.unstubAllGlobals()
  return screens
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const lineCount = (element: Element) => {
      const tops = new Set<number>()
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) tops.add(Math.round(rect.top / 4))
      }
      return tops.size
    }
    const flow = document.querySelector('[data-question-flow]')!
    const main = flow.querySelector('main')!.getBoundingClientRect()
    const block = flow.querySelector('main > div')!.getBoundingClientRect()
    const sentence = flow.querySelector<HTMLElement>('[data-intro-sentence]')
    return {
      title: lineCount(flow.querySelector('h1')!),
      labels: [...flow.querySelectorAll('button')].filter((button) => button.textContent.trim()).map((button) => ({ label: button.textContent.trim(), lines: lineCount(button) })),
      sentenceClipped: sentence ? sentence.scrollHeight > sentence.clientHeight + 1 || sentence.scrollWidth > sentence.clientWidth + 1 : false,
      centreOffset: Math.abs((block.top + block.bottom) / 2 - (main.top + main.bottom) / 2),
      blockFits: block.height < main.height,
    }
  })
}

describe('guided onboarding layout', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  }, 30_000)
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each(LOCALES.flatMap(({ locale, messages }) => WIDTHS.map((width) => ({ locale, messages, width }))))('holds each intro title and action label on one line, the first question in two lines at most, and centres the block at $width in $locale', async ({ locale, messages, width }) => {
    const screens = captureScreens(locale, messages)
    const tokens = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage({ viewport: { width, height: HEIGHT }, reducedMotion: 'reduce' })
    try {
      for (const [index, markup] of screens.entries()) {
        await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens}}body{margin:0;background:var(--bg)}#frame{display:flex;flex-direction:column;width:${width}px;height:${HEIGHT}px}</style><div id="frame">${markup}</div>`)
        await loadAppFonts(page)
        const result = await measure(page)
        expect(result.title, `title of screen ${index}`).toBeLessThanOrEqual(index < 3 ? 1 : 2)
        for (const label of result.labels) expect(label.lines, label.label).toBe(1)
        expect(result.sentenceClipped).toBe(false)
        expect(result.centreOffset).toBeLessThanOrEqual(1)
      }
    } finally { await page.close() }
  }, 60_000)
})
