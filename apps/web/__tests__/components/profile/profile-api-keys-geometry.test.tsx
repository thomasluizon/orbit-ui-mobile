import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listRowValueCases } from '@orbit/shared/test-support/list-row-values'
import { ListRow } from '@/components/ui/list-row'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
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
          gap: Math.max(valueBox.top - titleBox.bottom, valueBox.left - titleBox.right),
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

  it.each(['en', 'pt-BR'])('keeps every value caller inside its row at 412px in %s', async (locale) => {
    const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    const cases = listRowValueCases(locale, (key, values) => t(key as Parameters<typeof t>[0], values))
    const { container } = render(<div style={{ padding: 16 }}>{cases.map(({ surface, props, statusRing }) => <div key={surface} data-surface={surface}><ListRow {...props} onClick={() => {}} trailing={statusRing ? <span style={{ width: 24, height: 24 }} /> : undefined} /></div>)}</div>)
    const page = await browser.newPage({ viewport: { width: 412, height: 2400 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.evaluate(() => [...document.querySelectorAll('[data-surface]')].map((surface) => {
        const title = surface.querySelector('[data-slot="list-row-title"]')!
        const value = surface.querySelector<HTMLElement>('[data-slot="list-row-value"]')!
        const titleBox = title.getBoundingClientRect()
        const valueBox = value.getBoundingClientRect()
        const rowBox = surface.getBoundingClientRect()
        const style = getComputedStyle(value)
        return { surface: surface.getAttribute('data-surface'), size: parseFloat(style.fontSize), gap: Math.max(valueBox.top - titleBox.bottom, valueBox.left - titleBox.right), contained: valueBox.right <= rowBox.right && valueBox.left >= rowBox.left, overflowing: value.scrollWidth > value.clientWidth, textOverflow: style.textOverflow, overflow: style.overflow, whiteSpace: style.whiteSpace }
      }))
      expect(measured).toHaveLength(cases.length)
      for (const row of measured) {
        expect(row.size, row.surface!).toBe(12)
        expect(row.gap, row.surface!).toBeGreaterThanOrEqual(12)
        expect(row.contained, row.surface!).toBe(true)
        const truncates = cases.find(({ surface }) => surface === row.surface)!.truncatesValue === true
        expect(row.overflowing, row.surface!).toBe(truncates)
        if (truncates) expect(row).toMatchObject({ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' })
      }
    } finally { await page.close() }
  })
  it.each(['en', 'pt-BR'].flatMap((locale) => [412, 1440].map((width) => ({ locale, width }))))('keeps the notification label and switch readable in $locale at $width px', async ({ locale, width }) => {
    settings.locale = locale as 'en' | 'pt-BR'
    const { container } = render(<div style={{ padding: 16 }}><PushDevicesRow count={5} max={5} currentDeviceRegistered={false} supported loading={false} error={false} permission="default" status="not-registered" onToggle={() => {}} onRetry={() => {}} /></div>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
        const control = document.querySelector<HTMLElement>('[role="switch"]')!
        const titleBox = title.getBoundingClientRect()
        const switchBox = control.getBoundingClientRect()
        return { titleFits: title.scrollWidth <= title.clientWidth, separated: titleBox.right <= switchBox.left, switchWidth: switchBox.width, switchHeight: switchBox.height, switches: document.querySelectorAll('[role="switch"]').length, text: document.body.textContent }
      })
      expect(measured).toMatchObject({ titleFits: true, separated: true, switchWidth: 48, switchHeight: 44, switches: 1 })
      expect(measured.text).not.toContain('5 of 5')
      expect(measured.text).not.toContain('5 de 5')
    } finally { await page.close() }
  })

})
