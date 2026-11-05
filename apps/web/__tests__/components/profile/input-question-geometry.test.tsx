import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Page } from 'playwright-core'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { Profile } from '@orbit/shared/types/profile'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { chooseApiKeyCreation } from '@/__tests__/support/api-key-creation'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const context = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR' }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams('operation=keys') }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const english = (await import('@orbit/shared/i18n/en.json')).default
  const portuguese = (await import('@orbit/shared/i18n/pt-BR.json')).default
  return {
    ...actual,
    useLocale: () => context.locale,
    useTranslations: (namespace?: 'stepUp') => actual.createTranslator({ locale: context.locale, messages: context.locale === 'en' ? english : portuguese, namespace }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn(), confirmApiKeyCreationChallenge: vi.fn() }))
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
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))

import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { SupportForm } from '@/app/(app)/support/_components/support-form'
import { useAuthStore } from '@/stores/auth-store'
import { resetAuthStore } from '@/__tests__/support/account-change'

const CASES = [320, 1280].flatMap((width) => [1, 2].flatMap((scale) => (['en', 'pt-BR'] as const).flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ width, scale, locale, mode })))))

async function readQuestionEdges(page: Page, column: string, name: string) {
  const question = page.locator(column).getByRole('button', { name, exact: true })
  await question.hover()
  await expect.poll(() => question.evaluate((element) => getComputedStyle(element.querySelector('[data-press-fill]')!).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  return question.evaluate((element, selector) => {
    const frame = element.closest(selector)!.getBoundingClientRect()
    const target = element.getBoundingClientRect()
    const fill = element.querySelector('[data-press-fill]')!
    const paint = fill.getBoundingClientRect()
    const title = element.querySelector('[data-slot="list-row-title"]')!
    const range = document.createRange()
    range.selectNodeContents(title)
    const lines = [...range.getClientRects()]
    return {
      target: [target.left - frame.left, frame.right - target.right],
      fill: [paint.left - frame.left, frame.right - paint.right],
      textInset: Math.min(...lines.map((line) => line.left - target.left), ...lines.map((line) => target.right - line.right)),
    }
  }, column)
}

describe('input question geometry', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  }, 30_000)
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each(CASES)('keeps the API key expiry question on the field edge at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
    context.locale = locale
    const messages = locale === 'en' ? en : ptBR
    vi.stubGlobal('fetch', vi.fn())
    await resetAuthStore()
    useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
    render(<QueryClientProvider client={new QueryClient()}><ProfileApiKeys profile={{ hasProAccess: true, activeApiKeyCount: 0 } as Profile} unlocked /></QueryClientProvider>)
    await chooseApiKeyCreation(messages.profile.apiKeys.create, messages.profile.apiKeys.create)
    const markup = document.querySelector('[data-api-key-questions]')!.outerHTML
    cleanup()
    vi.unstubAllGlobals()
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;background:var(--bg)}main{padding:16px}</style><main>${markup}</main>`)
      await loadAppFonts(page)
      const edges = await readQuestionEdges(page, '[data-api-key-questions]', messages.profile.apiKeys.setExpiry)
      for (const edge of [...edges.target, ...edges.fill]) expect(Math.abs(edge)).toBeLessThanOrEqual(1)
      expect(edges.textInset).toBeGreaterThanOrEqual(8)
    } finally { await page.close() }
  })

  it.each(CASES)('keeps the revealed expiry closer to its question than to the key name at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
    context.locale = locale
    const messages = locale === 'en' ? en : ptBR
    vi.stubGlobal('fetch', vi.fn())
    await resetAuthStore()
    useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
    render(<QueryClientProvider client={new QueryClient()}><ProfileApiKeys profile={{ hasProAccess: true, activeApiKeyCount: 0 } as Profile} unlocked /></QueryClientProvider>)
    await chooseApiKeyCreation(messages.profile.apiKeys.create, messages.profile.apiKeys.create)
    fireEvent.click(screen.getByRole('button', { name: messages.profile.apiKeys.setExpiry }))
    const markup = document.querySelector('[data-api-key-questions]')!.outerHTML
    cleanup()
    vi.unstubAllGlobals()
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;background:var(--bg)}main{padding:16px}</style><main>${markup}</main>`)
      await loadAppFonts(page)
      const gaps = await page.evaluate(() => {
        const questions = document.querySelector('[data-api-key-questions]')!
        const name = questions.querySelector('[data-input-root]')!.getBoundingClientRect()
        const group = questions.querySelector('[data-api-key-expiry-group]')!
        const question = group.querySelector('button[aria-expanded="true"]')!
        const row = question.parentElement!.parentElement!.getBoundingClientRect()
        const region = document.getElementById(question.getAttribute('aria-controls')!)!.getBoundingClientRect()
        return { between: group.getBoundingClientRect().top - name.bottom, within: region.top - row.bottom, height: region.height }
      })
      expect(gaps.between).toBeCloseTo(16, 0)
      expect(gaps.within).toBeCloseTo(8, 0)
      expect(gaps.height).toBeGreaterThan(0)
      expect(gaps.between).toBeGreaterThanOrEqual(gaps.within * 2)
    } finally { await page.close() }
  })

  it.each(CASES)('reveals the support message one group below the subject at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
    context.locale = locale
    const messages = locale === 'en' ? en : ptBR
    const form = (subject: 'problem' | null) => <SupportForm email="ada@example.com" subject={subject} message="" appVersion={null} messageMaxLength={5000} messageOverLimitHint={null} error={null} subjectError={null} messageError={null}
      isSending={false} isOnline disabled={false} disabledReason={null} subjectFocusRequest={0} messageFocusRequest={0} onSubjectChange={vi.fn()} onMessageChange={vi.fn()} onSubjectBlur={vi.fn()} onMessageBlur={vi.fn()} onSend={vi.fn()} />
    const { container, rerender } = render(form(null))
    expect(container.querySelector('textarea')).toBeNull()
    rerender(form('problem'))
    const markup = container.innerHTML
    cleanup()
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;background:var(--bg)}main{padding:16px}</style><main>${markup}</main>`)
      await loadAppFonts(page)
      const geometry = await page.evaluate((question) => {
        const column = document.querySelector('main')!.getBoundingClientRect()
        const group = document.querySelector('[role="radiogroup"]')!.parentElement!.getBoundingClientRect()
        const field = document.querySelector('textarea')!
        const label = [...document.querySelectorAll('label, span')].find((element) => element.textContent.trim().startsWith(question))!.getBoundingClientRect()
        const box = field.getBoundingClientRect()
        return { gap: label.top - group.bottom, left: box.left - column.left - 16, right: column.right - 16 - box.right }
      }, messages.profile.support.message)
      expect(geometry.gap).toBeCloseTo(24, 0)
      expect(geometry.left).toBeGreaterThanOrEqual(-1)
      expect(geometry.right).toBeGreaterThanOrEqual(-1)
    } finally { await page.close() }
  })
})
