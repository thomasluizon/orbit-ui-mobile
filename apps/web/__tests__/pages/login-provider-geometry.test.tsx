import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { cleanup, render } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { authLocales, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('motion/react', async () => {
  const React = await import('react')
  return { useReducedMotion: () => true,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) } }
})

const cases = [320, 1280].flatMap(width => authLocales.flatMap(locale =>
  [false, true].flatMap(apple => (['email', 'google', 'offline'] as const).map(state => ({ width, locale, apple, state }))),
))

describe('Login provider geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(() => { cleanup(); vi.unstubAllEnvs() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('fills and stacks providers at $width in $locale, Apple $apple, $state', async ({ width, locale, apple, state }) => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', apple ? 'test-client' : '')
    mocks.flow = { ...createLoginScreenFixture(state, locale),
      t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }) }
    const { container } = render(<LoginContent />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const [primary, ...providers] = await page.getByRole('button').evaluateAll(buttons => buttons.map(button => {
        const bounds = button.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width }
      }))
      expect(primary!.width).toBeGreaterThan(0)
      expect(providers).toHaveLength(apple ? 2 : 1)
      let previousBottom = primary!.bottom
      for (const provider of providers) {
        expect(provider.width).toBeCloseTo(primary!.width, 1)
        expect(provider.left).toBeCloseTo(primary!.left, 1)
        expect(provider.right).toBeCloseTo(primary!.right, 1)
        expect(provider.top).toBeGreaterThan(previousBottom)
        previousBottom = provider.bottom
      }
    } finally { await page.close() }
  })
})
