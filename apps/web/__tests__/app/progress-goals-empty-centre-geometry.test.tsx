import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'
import { DESTINATION_MAIN_CLASS_NAME } from '@/components/shell/destination-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/progress/goals', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile(), isError: false, isLoading: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: vi.fn(),
  useGoals: () => ({ data: { allGoals: [] }, isError: false, isLoading: false, refetch: vi.fn() }),
  useReorderGoals: () => ({ isError: false, isPending: false, mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => false, useIsWideDesktop: () => false }))

function GoalsInShell() {
  const host = useRef<HTMLDivElement>(null)
  return <ShellHeaderHostContext.Provider value={host}>
    <ShellWide items={[]} activeId="" navLabel={ptBr.nav.mainNavigation} astraRow={{ label: 'Astra', onOpen: () => {} }}
      registerHeaderHost={element => { host.current = element }} notice={<></>} tabBar={<nav style={{ height: 80 }}>Tabs</nav>}>
      <div id="orbit-main" className={DESTINATION_MAIN_CLASS_NAME}>
        <div data-route-motion="" className="flex flex-1 flex-col has-[[data-page-viewport]]:h-full"><ProgressContent screen="goals" /></div>
      </div>
    </ShellWide>
  </ShellHeaderHostContext.Provider>
}

const cases = (['light', 'dark'] as const).flatMap(mode => [360, 412, 600].map(width => ({ width, mode })))

describe('Progresso Metas empty state centring in Chromium', () => {
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

  it.each(cases)('centres the empty group between the header and the tab bar at $width px in $mode', async ({ width, mode }) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}><GoalsInShell /></NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('[data-shell-header] [data-page-header]')!.getBoundingClientRect()
        const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
        const group = document.querySelector('[data-shell-scroller] [data-mark]')!.getBoundingClientRect()
        return { free: { top: header.bottom, bottom: tabs.top }, group: { top: group.top, bottom: group.bottom } }
      })
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const groupCentre = (geometry.group.top + geometry.group.bottom) / 2
      expect(Math.abs(groupCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})
