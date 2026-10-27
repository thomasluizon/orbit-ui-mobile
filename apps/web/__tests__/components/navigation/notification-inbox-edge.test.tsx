import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
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
import { ShellWide } from '@/components/shell/shell-wide'
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
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

function InboxInShell() {
  const host = useRef<HTMLDivElement>(null)
  return <ShellHeaderHostContext.Provider value={host}>
    <ShellWide nav={false} registerHeaderHost={element => { host.current = element }}><NotificationInbox /></ShellWide>
  </ShellHeaderHostContext.Provider>
}

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

  it.each([28, 44, 64].flatMap(left => (['en', 'pt-BR'] as const).map(locale => ({ left, right: 88 - left, locale }))))(
    'insets the hosted inbox header with $left/$right side insets in $locale', async ({ left, right, locale }) => {
      inbox.state = 'populated'
      inbox.items = [createMockNotification()]
      const words = locale === 'en' ? en : ptBr
      const view = render(<NextIntlClientProvider locale={locale} messages={words}><InboxInShell /></NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } })
      try {
        const session = await page.context().newCDPSession(page)
        await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left, right } })
        await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('[data-shell-header]')!
          const bounds = (element: Element) => {
            const box = element.getBoundingClientRect()
            return { left: box.left, right: box.right }
          }
          return { surface: bounds(header.parentElement!), header: bounds(header),
            controls: [...header.querySelectorAll('header, h1, button')].map(bounds) }
        })
        expect(geometry.surface).toEqual({ left: 0, right: 844 })
        for (const box of [geometry.header, ...geometry.controls]) {
          expect.soft(box.left).toBeGreaterThanOrEqual(left)
          expect.soft(box.right).toBeLessThanOrEqual(844 - right)
        }
      } finally { await page.close() }
    },
  )

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
      // WHY: #1570 centres the retained list cap within the full header column. https://github.com/thomasluizon/orbit-tickets/issues/1570
      const frameInset = (Math.min(width, 740) - geometry.listWidth) / 2
      expect(Math.abs(geometry.rowLeft - geometry.backLeft - 8 - frameInset)).toBeLessThanOrEqual(0.5)
      expect(geometry.listWidth).toBe(width < 1024 ? Math.min(width, 740) : 592)
      expect(geometry.firstWidth).toBe(width < 1024 ? Math.min(width, 740) - 32 : 560)
      expect(geometry.lastWidth).toBe(geometry.firstWidth)
    } finally { await page.close() }
  })
})
