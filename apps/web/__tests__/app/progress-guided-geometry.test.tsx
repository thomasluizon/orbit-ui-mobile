import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useRef, type ReactElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError } from '@orbit/shared/utils'
import { progressStreakNow, progressStreakStates } from '@orbit/shared/__tests__/progress-streak-fixtures'
import { deriveStreakFreezeState } from '@orbit/shared/utils/gamification-selectors'
import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'
import { DESTINATION_MAIN_CLASS_NAME } from '@/components/shell/destination-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { ShellHeaderHostContext } from '@/components/shell/shell-header'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const state = vi.hoisted(() => {
  const retrospective: Record<string, unknown> = {}
  const freeze: Record<string, unknown> = {}
  return { retrospective, freeze, streakError: false, repairMutate: vi.fn() }
})

vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('next/navigation', () => ({ usePathname: () => '/progress', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => false, useIsWideDesktop: () => false }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('@/components/share/share-card-entry-button', () => ({ ShareCardEntryButton: () => null }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ refetch: vi.fn(), ...state.retrospective }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', canViewGamification: true }, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ profile: { level: 1, totalXp: 0, xpForNextLevel: 100, achievements: [] }, xpProgress: 0, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useStreakFreeze: () => ({ ...state.freeze, streakQuery: { isError: state.streakError, refetch: vi.fn() } }),
  useRepairStreak: () => ({ isPending: false, isError: false, error: null, mutate: state.repairMutate, reset: vi.fn() }),
}))

const WIDTHS = [320, 360, 384, 412] as const
const LOCALES = { en, 'pt-BR': ptBr } as const
type Locale = keyof typeof LOCALES

function ProgressInShell({ screen }: Readonly<{ screen?: 'streak' }>) {
  const host = useRef<HTMLDivElement>(null)
  return <ShellHeaderHostContext.Provider value={host}>
    <ShellWide items={[]} activeId="" navLabel={ptBr.nav.mainNavigation} astraRow={{ label: 'Orbit', onOpen: () => {} }}
      registerHeaderHost={element => { host.current = element }} notice={<></>} tabBar={<nav style={{ height: 80 }}>Tabs</nav>}>
      <div id="orbit-main" className={DESTINATION_MAIN_CLASS_NAME}>
        <div data-route-motion="" className="flex flex-1 flex-col has-[[data-page-viewport]]:h-full"><ProgressContent screen={screen} /></div>
      </div>
    </ShellWide>
  </ShellHeaderHostContext.Provider>
}

function setStreak(name: string) {
  const streak = progressStreakStates.find((entry) => entry.name === name)!.streak
  state.freeze = { ...deriveStreakFreezeState(streak, null, '2026-09-10'), streakInfo: streak }
}

describe('Progresso guided geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); state.streakError = false })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function measure<T>(width: number, locale: Locale, ui: ReactElement, prepare: () => void, read: () => T): Promise<T> {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(progressStreakNow))
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<NextIntlClientProvider locale={locale} messages={LOCALES[locale]} timeZone="UTC">{ui}</NextIntlClientProvider>)
    prepare()
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
      return await page.evaluate(read)
    } finally { await page.close() }
  }

  it.each(WIDTHS.flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('centres the empty window under Orbit and keeps both question headings on one line at $width in $locale', async ({ width, locale }) => {
    state.retrospective = { isLoading: false, isError: true, error: createApiClientError(400, { errorCode: 'NO_HABITS_FOR_PERIOD' }, 'Empty') }
    const geometry = await measure(width, locale, <ProgressInShell />, () => {}, () => {
      const column = document.querySelector('[data-progress-screen="overview"] > div:last-child')!.getBoundingClientRect()
      const group = document.querySelector('[data-progress-orbit]')!
      const centreOf = (element: Element) => { const box = element.getBoundingClientRect(); return box.left + box.width / 2 }
      const headings = [...document.querySelectorAll('[data-progress-screen="overview"] h2')].map((heading) => {
        const box = heading.getBoundingClientRect()
        return { lines: Math.round(box.height / Number.parseFloat(getComputedStyle(heading).lineHeight)), overflow: heading.scrollWidth > heading.clientWidth }
      })
      return { columnCentre: column.left + column.width / 2, parts: [...group.children].map(centreOf), headings }
    })
    for (const part of geometry.parts) expect(Math.abs(part - geometry.columnCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    for (const heading of geometry.headings) expect(heading, JSON.stringify(geometry)).toEqual({ lines: 1, overflow: false })
  })

  it.each(WIDTHS.flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('keeps the window question on one line at $width in $locale', async ({ width, locale }) => {
    state.retrospective = { isLoading: true, isError: false, error: null }
    const headings = await measure(width, locale, <ProgressInShell />, () => {}, () => [...document.querySelectorAll('[data-progress-screen="overview"] h2')].map((heading) => ({
      text: heading.textContent,
      lines: Math.round(heading.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(heading).lineHeight)),
    })))
    expect(headings.map((heading) => heading.text)).toEqual([LOCALES[locale].progressScreen.sections.windowQuestion, LOCALES[locale].progressScreen.sectionsQuestion])
    for (const heading of headings) expect(heading.lines, JSON.stringify(heading)).toBe(1)
  })

  it.each(WIDTHS)('centres the full-surface error of Sequência between the header and the tab bar at %i px', async (width) => {
    state.streakError = true
    setStreak('ordinary')
    const geometry = await measure(width, 'pt-BR', <ProgressInShell screen="streak" />, () => {}, () => {
      const header = document.querySelector('[data-shell-header] [data-page-header]')!.getBoundingClientRect()
      const tabs = document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect()
      const group = document.querySelector('[data-progress-surface-error]')!.getBoundingClientRect()
      return { free: { top: header.bottom, bottom: tabs.top }, group: { top: group.top, bottom: group.bottom } }
    })
    expect(Math.abs((geometry.group.top + geometry.group.bottom) / 2 - (geometry.free.top + geometry.free.bottom) / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
  })

  it.each(WIDTHS.flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('centres the repair question block and keeps it within two lines at $width in $locale', async ({ width, locale }) => {
    setStreak('partial repair bank')
    state.freeze = { ...state.freeze, streakFreezesAccumulated: 2, freezesAvailable: 2 }
    const geometry = await measure(width, locale, <ProgressInShell screen="streak" />, () => {
      fireEvent.click(within(document.querySelector<HTMLElement>('[data-streak-repair]')!).getByRole('button'))
    }, () => {
      const header = document.querySelector('[data-question-flow] header')!.getBoundingClientRect()
      const flow = document.querySelector('[data-question-flow]')!.getBoundingClientRect()
      const block = document.querySelector('[data-question-flow] [role="presentation"]')!.getBoundingClientRect()
      const question = document.querySelector('[data-question-flow] h1')!
      return {
        free: { top: header.bottom, bottom: flow.bottom }, block: { top: block.top, bottom: block.bottom },
        questionLines: Math.round(question.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(question).lineHeight)),
      }
    })
    expect(Math.abs((geometry.block.top + geometry.block.bottom) / 2 - (geometry.free.top + geometry.free.bottom) / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    expect(geometry.questionLines).toBeLessThanOrEqual(2)
  })

  it.each(WIDTHS)('centres the repair result dialog at %i px', async (width) => {
    setStreak('repair available')
    const geometry = await measure(width, 'pt-BR', <ProgressInShell screen="streak" />, () => {
      fireEvent.click(within(document.querySelector<HTMLElement>('[data-streak-repair]')!).getByRole('button'))
      fireEvent.click(screen.getByRole('button', { name: ptBr.progressScreen.streak.repairFlow.repair }))
      act(() => { (state.repairMutate.mock.calls.at(-1)![1] as { onSuccess: (info: { currentStreak: number }) => void }).onSuccess({ currentStreak: 3 }) })
    }, () => {
      const panel = document.querySelector('[data-result-dialog]')!.getBoundingClientRect()
      return { centreX: panel.left + panel.width / 2, centreY: (panel.top + panel.bottom) / 2, width: innerWidth, height: innerHeight }
    })
    expect(Math.abs(geometry.centreX - geometry.width / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry.centreY - geometry.height / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
  })
})
