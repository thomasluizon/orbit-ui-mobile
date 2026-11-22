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
import { CalendarBody } from '@/app/(app)/calendar/_components/calendar-body'
import { calendarPageLayout } from '@/app/(app)/calendar/_components/use-calendar-screen-state'
import { DESTINATION_MAIN_CLASS_NAME } from '@/components/shell/destination-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

function CalendarInShell({ failed }: Readonly<{ failed: 'profile' | 'month' }>) {
  const host = useRef<HTMLDivElement>(null)
  const profile = failed === 'profile'
  const layout = calendarPageLayout('month', !profile, profile, !profile, <div data-calendar-header-probe="" style={{ height: 220 }} />)
  return <ShellHeaderHostContext.Provider value={host}>
    <ShellWide items={[]} activeId="" navLabel={ptBr.nav.mainNavigation} orbitRow={{ label: 'Orbit', onOpen: () => {} }}
      registerHeaderHost={element => { host.current = element }} notice={<></>} tabBar={<nav style={{ height: 80 }}>Tabs</nav>}>
      <div id="orbit-main" className={DESTINATION_MAIN_CLASS_NAME}>
        <div data-route-motion="" className="flex flex-1 flex-col has-[[data-page-viewport]]:h-full">
          <div {...layout.viewportProps} data-calendar-page="" className={layout.pageClass}>
            <div className={layout.contentClass}>
              {layout.header}
              <CalendarBody profileReady={!profile} profileError={profile ? new Error('profile unavailable') : null} onRetryProfile={() => {}} error={profile ? null : 'month unavailable'} onRetry={() => {}}><p>The month</p></CalendarBody>
            </div>
          </div>
        </div>
      </div>
    </ShellWide>
  </ShellHeaderHostContext.Provider>
}

const catalogs = { 'pt-BR': ptBr, en } as const
const cases = (['pt-BR', 'en'] as const).flatMap(locale => [320, 360, 384, 412].flatMap(width => (['profile', 'month'] as const).map(failed => ({ width, locale, failed }))))

describe('Calendário load error centring in Chromium', () => {
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

  it.each(cases)('centres the $failed read failure between the header and the tab bar at $width px in $locale, the line within two lines', async ({ width, locale, failed }) => {
    const messages = catalogs[locale]
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><CalendarInShell failed={failed} /></NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate((copy) => {
        const probe = document.querySelector('[data-calendar-header-probe]')!.getBoundingClientRect()
        const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
        const line = [...document.querySelectorAll('[data-shell-scroller] p')].find(element => element.textContent === copy)!
        const group = line.parentElement!.getBoundingClientRect()
        return {
          free: { top: probe.bottom, bottom: tabs.top }, group: { top: group.top, bottom: group.bottom }, mascots: line.parentElement!.querySelectorAll('[data-orbit-state="parado"]').length,
          lines: Math.round(line.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(line).lineHeight)),
        }
      }, messages.calendar.orbit.loadError)
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const groupCentre = (geometry.group.top + geometry.group.bottom) / 2
      expect(Math.abs(groupCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(geometry.mascots).toBe(1)
      expect(geometry.lines, JSON.stringify(geometry)).toBeLessThanOrEqual(2)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})
