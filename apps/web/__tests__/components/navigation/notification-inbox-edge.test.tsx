import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const inbox = vi.hoisted(() => ({ items: [] as import('@orbit/shared/types/notification').NotificationItem[], state: 'empty' }))
const states = ['populated', 'loading', 'empty', 'error'] as const
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-notifications', () => ({
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutateAsync: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({
  notifications: inbox.items, visibleNotifications: inbox.items, visibleUnreadCount: inbox.items.length,
  isLoading: inbox.state === 'loading', isError: inbox.state === 'error', pendingDeleteIds: [], refetch: vi.fn(),
}) }))
vi.mock('@/hooks/use-session-reset', () => ({ useResetOnAccountChange: () => {} }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications' }))

const cases = [412, 600, 840, 1100, 1352].flatMap((width) => (['en', 'pt-BR'] as const)
  .flatMap((locale) => states.map((state) => ({ width, locale, state }))))

describe('Avisos content edge in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('aligns the capped $state list at $width in $locale', async ({ width, locale, state }) => {
    const words = locale === 'en' ? en : ptBr
    inbox.state = state
    inbox.items = state === 'populated' ? [0, 1, 2].map((index) => createMockNotification({ id: `edge-${index}` })) : []
    const { container } = render(<NextIntlClientProvider locale={locale} messages={words}><NotificationInbox /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="width:100%;max-width:740px;margin-inline:auto">${container.innerHTML}</main>`)
      const geometry = await page.evaluate((backLabel) => {
        const list = document.querySelector('ul')!
        const back = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === backLabel)!
        return { backLeft: back.getBoundingClientRect().left, listWidth: list.getBoundingClientRect().width,
          rowLeft: list.firstElementChild!.getBoundingClientRect().left,
          firstWidth: list.firstElementChild!.getBoundingClientRect().width,
          lastWidth: list.lastElementChild!.getBoundingClientRect().width }
      }, words.common.back)
      expect(Math.abs(geometry.rowLeft - geometry.backLeft - 8)).toBeLessThanOrEqual(0.5)
      expect(geometry.listWidth).toBe(width < 1024 ? Math.min(width, 740) : 592)
      expect(geometry.firstWidth).toBe(width < 1024 ? Math.min(width, 740) - 32 : 560)
      expect(geometry.lastWidth).toBe(geometry.firstWidth)
    } finally { await page.close() }
  })
})
