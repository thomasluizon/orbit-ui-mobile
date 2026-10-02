import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'

const settings = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR' }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  const ptBR = (await import('@orbit/shared/i18n/pt-BR.json')).default
  return {
    ...actual,
    useLocale: () => settings.locale,
    useTranslations: () => actual.createTranslator({ locale: settings.locale, messages: settings.locale === 'en' ? messages : ptBR }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn() }))
vi.mock('@/hooks/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: vi.fn(),
  }),
}))


describe('Profile API key row geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['en', 'pt-BR'].flatMap((locale) => [0, 1, 3].map((count) => ({ locale, count }))))('separates title and meta for $count keys in $locale at 412px', async ({ locale, count }) => {
    settings.locale = locale as 'en' | 'pt-BR'
    const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    const title = t('profile.apiKeys.open')
    const value = count === 0 ? t('profile.apiKeys.noKeys') : t('profile.apiKeys.activeCount', { count })
    let container!: HTMLElement
    await act(async () => { ({ container } = render(<QueryClientProvider client={new QueryClient()}><div style={{ padding: 16 }}><ProfileApiKeys profile={{ ...profileFixture, hasProAccess: true, activeApiKeyCount: count }} unlocked={false} /></div></QueryClientProvider>)) })
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.evaluate(({ title, value }) => {
        const spans = [...document.querySelectorAll('span')]
        const titleElement = spans.find((span) => span.textContent === title && span.children.length === 0)!
        const valueElement = spans.find((span) => span.textContent === value && span.children.length === 0)!
        const titleBox = titleElement.getBoundingClientRect()
        const valueBox = valueElement.getBoundingClientRect()
        const titleRange = document.createRange()
        titleRange.selectNodeContents(titleElement)
        const valueRange = document.createRange()
        valueRange.selectNodeContents(valueElement)
        const style = getComputedStyle(valueElement)
        return {
          fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), letterSpacing: parseFloat(style.letterSpacing),
          gap: valueBox.top >= titleBox.bottom ? valueBox.top - titleBox.bottom : valueBox.left - titleBox.right,
          stacked: valueBox.top >= titleBox.bottom,
          titleLines: titleRange.getClientRects().length, valueLines: valueRange.getClientRects().length,
          contained: valueBox.right <= 412 && titleBox.left >= 0,
        }
      }, { title, value })
      expect(measured, JSON.stringify(measured)).toMatchObject({ fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, titleLines: 1, valueLines: 1, contained: true })
      expect(measured.gap).toBeGreaterThanOrEqual(12)
      expect(measured.stacked).toBe(locale === 'pt-BR' && count === 0)
    } finally { await page.close() }
  })
})
