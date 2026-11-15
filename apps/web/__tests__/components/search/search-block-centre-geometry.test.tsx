import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import SearchPage from '@/app/(app)/search/page'
import { DESTINATION_MAIN_CLASS_NAME } from '@/components/shell/destination-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => '/search' }))
/** What the search returns: no read yet, or one shown row out of `totalCount`. */
const search = vi.hoisted(() => ({ totalCount: null as number | null }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: () => {
  const habits = search.totalCount ? [createMockHabit({ id: 'walk', title: 'Walk', searchMatches: [{ field: 'title', value: null }] })] : []
  const data = search.totalCount === null ? undefined : { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: search.totalCount, totalPages: 1, currentPage: 1 }
  return { data, isPending: false, isFetching: false, isSuccess: true, isError: false, refetch: vi.fn() }
} }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))

function SearchInShell() {
  const host = useRef<HTMLDivElement>(null)
  return <ShellHeaderHostContext.Provider value={host}>
    <ShellWide items={[]} activeId="" navLabel={ptBr.nav.mainNavigation} astraRow={{ label: ptBr.shell.astraButton.open, onOpen: () => {} }}
      registerHeaderHost={element => { host.current = element }} notice={<></>} tabBar={<nav style={{ height: 80 }}>Tabs</nav>}>
      <div id="orbit-main" className={DESTINATION_MAIN_CLASS_NAME}>
        <div data-route-motion="" className="flex flex-1 flex-col has-[[data-page-viewport]]:h-full"><SearchPage /></div>
      </div>
    </ShellWide>
  </ShellHeaderHostContext.Provider>
}

const cases = ([['pt-BR', ptBr], ['en', en]] as const).flatMap(([locale, messages]) => [320, 360, 384, 412].map(width => ({ width, locale, messages })))

describe('the search question block centring in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    enableTestFlags('orbit_guided_flows')
    search.totalCount = null
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres Orbit, the question and the field between the header and the tab bar at $width px in $locale, with the question on at most two lines', async ({ width, locale, messages }) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><SearchInShell /></NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('[data-shell-header] [data-page-header]')!.getBoundingClientRect()
        const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
        const block = document.querySelector('[data-search-block="resting"]')!
        const group = block.getBoundingClientRect()
        const question = block.querySelector('h1')!
        const field = block.querySelector('input')!.getBoundingClientRect()
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        return {
          free: { top: header.bottom, bottom: tabs.top, centreX: scroller.getBoundingClientRect().left + scroller.clientWidth / 2 },
          group: { top: group.top, bottom: group.bottom, left: group.left, right: group.right },
          questionLines: Math.round(question.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(question).lineHeight)),
          field: { height: field.height, left: field.left, right: field.right },
          viewport: document.documentElement.clientWidth,
        }
      })
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const groupCentre = (geometry.group.top + geometry.group.bottom) / 2
      expect(Math.abs(groupCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.group.left + geometry.group.right) / 2 - geometry.free.centreX), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(geometry.questionLines).toBeLessThanOrEqual(2)
      expect(geometry.field.height).toBeGreaterThanOrEqual(48)
      expect(geometry.field.left).toBeGreaterThanOrEqual(0)
      expect(geometry.field.right).toBeLessThanOrEqual(geometry.viewport)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })

  it.each(cases.flatMap((entry) => [{ ...entry, outcome: 'count' as const }, { ...entry, outcome: 'miss' as const }]))('keeps the Orbit line $outcome beside Orbit within its lines at $width px in $locale', async ({ width, locale, messages, outcome }) => {
    search.totalCount = outcome === 'count' ? 9999 : 0
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><SearchInShell /></NextIntlClientProvider>)
    fireEvent.change(view.container.querySelector('input')!, { target: { value: 'alongamento' } })
    await waitFor(() => expect(view.container.querySelector(`[data-search-line="${outcome}"]`)).not.toBeNull())
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate((kind) => {
        const line = document.querySelector<HTMLElement>(`[data-search-line="${kind}"]`)!
        const box = line.getBoundingClientRect()
        return { text: line.textContent, lines: Math.round(box.height / Number.parseFloat(getComputedStyle(line).lineHeight)), right: box.right, viewport: document.documentElement.clientWidth }
      }, outcome)
      expect(geometry.lines, JSON.stringify(geometry)).toBeLessThanOrEqual(outcome === 'count' ? 1 : 2)
      expect(geometry.right, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})
