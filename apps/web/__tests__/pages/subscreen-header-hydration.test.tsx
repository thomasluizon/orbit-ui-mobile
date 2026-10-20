import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import AboutPage from '@/app/(app)/about/page'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR' }))

vi.mock('next-intl', async (importOriginal) => ({
  ...await importOriginal<typeof import('next-intl')>(),
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: profileFixture }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({ FeatureGuideDrawer: () => null }))

function AboutInShell() {
  return <DestinationShell onCreate={() => {}}>
    <RouteTransitionShell><AboutPage /></RouteTransitionShell>
  </DestinationShell>
}

describe('sub-screen header first paint', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  for (const locale of ['en', 'pt-BR'] as const) {
    it.each([412, 840, 1100, 1352])(`keeps About and its back control stationary through hydration at %ipx in ${locale}`, async (width) => {
      mocks.locale = locale
      const container = document.createElement('div')
      container.innerHTML = renderToString(<AboutInShell />)
      document.body.append(container)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      const recoverableError = vi.fn()
      let root: ReturnType<typeof hydrateRoot> | undefined
      try {
        const measure = async () => {
          await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
          return page.evaluate(() => {
            const bounds = (element: Element | null) => {
              if (!element) return null
              const rectangle = element.getBoundingClientRect()
              return { left: rectangle.left, top: rectangle.top }
            }
            return {
              body: bounds(document.querySelector('[data-testid="about-identity"]')),
              back: bounds(document.querySelector('header button')),
              column: bounds(document.querySelector('[data-shell-column]')),
            }
          })
        }
        const firstPaint = await measure()
        await act(async () => { root = hydrateRoot(container, <AboutInShell />, { onRecoverableError: recoverableError }) })
        const hydrated = await measure()
        expect.soft(firstPaint.back).not.toBeNull()
        expect.soft(hydrated.body).toEqual(firstPaint.body)
        expect.soft(hydrated.back).toEqual(firstPaint.back)
        expect(hydrated.column).toEqual(firstPaint.column)
        expect(Math.abs(hydrated.body!.left - hydrated.back!.left - 8)).toBeLessThanOrEqual(0.5)
        expect(container.querySelectorAll('header button')).toHaveLength(1)
        expect(container.querySelector('[data-shell-header] header button')).not.toBeNull()
        expect(recoverableError).not.toHaveBeenCalled()
      } finally {
        await act(async () => { root?.unmount() })
        container.remove()
        await page.close()
      }
    })
  }
})
