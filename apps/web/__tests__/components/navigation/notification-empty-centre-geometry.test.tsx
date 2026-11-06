import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { DESTINATION_MAIN_CLASS_NAME } from '@/components/shell/destination-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const inbox: { state: 'empty' | 'error' } = vi.hoisted(() => ({ state: 'empty' }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-notifications', () => ({
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutateAsync: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({
  notifications: [], visibleNotifications: [], visibleUnreadCount: 0,
  isLoading: false, isError: inbox.state === 'error', pendingDeleteIds: [], refetch: vi.fn(),
}) }))
vi.mock('@/hooks/use-session-reset', () => ({ useResetOnAccountChange: () => {} }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications' }))

function InboxInShell() {
  const host = useRef<HTMLDivElement>(null)
  return <ShellHeaderHostContext.Provider value={host}>
    <ShellWide items={[]} activeId="" navLabel={ptBr.nav.mainNavigation} astraRow={{ label: 'Astra', onOpen: () => {} }}
      registerHeaderHost={element => { host.current = element }} notice={<></>} tabBar={<nav style={{ height: 80 }}>Tabs</nav>}>
      <div id="orbit-main" className={DESTINATION_MAIN_CLASS_NAME}>
        <div data-route-motion="" className="flex flex-1 flex-col has-[[data-page-viewport]]:h-full"><NotificationInbox /></div>
      </div>
    </ShellWide>
  </ShellHeaderHostContext.Provider>
}

const cases = (['light', 'dark'] as const).flatMap(mode => [
  ...[360, 412, 600].map(width => ({ width, mode, state: 'empty' as const })),
  { width: 412, mode, state: 'error' as const },
])

describe('Avisos empty state centring in Chromium', () => {
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

  it.each(cases)('centres the $state group between the header and the tab bar at $width px in $mode', async ({ width, mode, state }) => {
    inbox.state = state
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}><InboxInShell /></NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate((copy) => {
        const header = document.querySelector('[data-shell-header] [data-page-header]')!.getBoundingClientRect()
        const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
        const line = [...document.querySelectorAll('[data-shell-scroller] p')].find(element => element.textContent === copy)!
        const group = line.parentElement!.getBoundingClientRect()
        return { free: { top: header.bottom, bottom: tabs.top }, group: { top: group.top, bottom: group.bottom } }
      }, state === 'empty' ? ptBr.notifications.empty : ptBr.notifications.loadError)
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const groupCentre = (geometry.group.top + geometry.group.bottom) / 2
      expect(Math.abs(groupCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})
