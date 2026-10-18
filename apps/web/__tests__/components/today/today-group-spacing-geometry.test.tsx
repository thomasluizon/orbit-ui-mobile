import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { TodayPageClient } from '@/app/(app)/today-page-client'
import { useTodayNavigation } from '@/app/(app)/use-today-navigation'
import { HabitListEmptyState, HabitListSkeleton } from '@/components/habits/habit-list/empty-state'
import { LazyMotion, domAnimation } from 'motion/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { DestinationShell } from '@/components/shell/destination-shell'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ date: state.date }),
}))
const state = vi.hoisted(() => ({ lineVisible: true, profileReady: true, surface: 'list', date: '2026-09-04' }))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-09-04' }))
vi.mock('@/hooks/use-profile', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-profile')>(),
  useProfile: () => ({ profile: state.profileReady ? createMockProfile({ timeZone: 'UTC', lastCompletionDate: null }) : undefined }),
}))
vi.mock('@/hooks/use-proactive-item', () => ({
  useProactiveItem: () => ({ item: state.lineVisible ? createMockProactiveItem({ text: 'Você pode beber um copo de água agora mesmo.', localDate: '2026-09-04' }) : null, openItem: vi.fn() }),
}))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/app/(app)/use-today-page', () => ({ useTodayPage: () => ({
  nav: useTodayNavigation('2026-09-04'),
  data: { hasFetched: state.surface !== 'loading', isFetching: state.surface === 'loading', showLoadError: false, filters: {}, refetch: vi.fn() },
  habitListRef: { current: null }, selectedHabitIds: new Set(), selection: {},
}) }))
vi.mock('@/components/habits/habit-list', () => ({ HabitList: () => <div data-testid="spacing-list-surface">
  {state.surface === 'loading' ? <HabitListSkeleton /> : state.surface === 'empty'
    ? <HabitListEmptyState title="No habits" description="" />
    : <div style={{ minHeight: 68 }}>Habit</div>}
</div> }))
vi.mock('@/app/(app)/today-page-view', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/app/(app)/today-page-view')>(),
  TodayOverlays: () => null,
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))

describe('Hoje group spacing', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: 'Geist'; src: url(data:font/ttf;base64,${font}); } :root { --font-sans: 'Geist'; }`
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 412, 600, 1024, 1352].flatMap((width) => (['dark', 'light'] as const).flatMap((mode) =>
    (['en', 'pt-BR'] as const).map((locale) => ({ width, mode, locale })),
  )))('separates Hoje groups at $width in $mode and $locale', async ({ width, mode, locale }) => {
    const messages = locale === 'en' ? en : ptBr
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
    const markup = () => <LazyMotion features={domAnimation}><NextIntlClientProvider locale={locale} messages={messages}>
      <DestinationShell onCreate={() => {}} composer={<div style={{ height: 56 }} />}>
        <TodayPageClient initialToday="2026-09-04" initialHabits={null} />
      </DestinationShell>
    </NextIntlClientProvider></LazyMotion>
    const load = async () => {
      const { container, unmount } = render(markup())
      const html = container.innerHTML
      unmount()
      await page.setContent(`<style>${stylesheet}:root{${variables}}</style>${html}`)
      await page.evaluate(async (mode) => { document.documentElement.className = mode; await document.fonts.ready }, mode)
    }
    try {
      state.profileReady = true
      state.lineVisible = true
      state.surface = 'list'
      state.date = '2026-09-04'
      await load()
      const spacing = await page.evaluate((summaryTitle) => {
        const line = document.querySelector('.today-astra-line')!.getBoundingClientRect()
        const date = document.querySelector('[data-today-date-row]')!.getBoundingClientRect()
        const list = document.querySelector('[data-testid="spacing-list-surface"]')!.getBoundingClientRect()
        const scroller = document.querySelector('[data-shell-scroller]')!
        const summary = Array.from(document.querySelectorAll('section')).find((element) => element.getAttribute('aria-label') === summaryTitle)!.getBoundingClientRect()
        return { lineToDate: date.top - line.bottom, dateToSummary: summary.top - date.bottom, summaryToList: list.top - summary.bottom,
          endClearance: Number.parseFloat(getComputedStyle(scroller).paddingBottom) }
      }, messages.summary.title)
      expect.soft(spacing.lineToDate).toBeCloseTo(24, 1)
      expect(spacing.dateToSummary).toBeCloseTo(24, 1)
      expect(spacing.summaryToList).toBeCloseTo(24, 1)
      expect(spacing.endClearance).toBeGreaterThanOrEqual(24)
      state.lineVisible = false
      for (const surface of ['list', 'empty', 'loading']) {
        state.surface = surface
        await load()
        const spacing = await page.evaluate((summaryTitle) => {
          const owner = document.querySelector('[data-today-day-transition]')!.getBoundingClientRect()
          const date = document.querySelector('[data-today-date-row]')!.getBoundingClientRect()
          const list = document.querySelector('[data-testid="spacing-list-surface"]')!.getBoundingClientRect()
          const summary = Array.from(document.querySelectorAll('section')).find((element) => element.getAttribute('aria-label') === summaryTitle)?.getBoundingClientRect()
          return { dateInset: date.top - owner.top, dateToNext: (summary ?? list).top - date.bottom,
            summaryToList: summary ? list.top - summary.bottom : null, hasLine: Boolean(document.querySelector('.today-astra-line')) }
        }, messages.summary.title)
        expect(spacing).toMatchObject({ dateInset: 0, dateToNext: 24, summaryToList: surface === 'loading' ? null : 24, hasLine: false })
      }
      state.date = '2026-09-03'
      await load()
      expect(await page.evaluate(() => {
        const notice = document.querySelector('[data-today-date-row]')!.parentElement!.lastElementChild!
        const list = document.querySelector('[data-testid="spacing-list-surface"]')!
        return list.getBoundingClientRect().top - notice.getBoundingClientRect().bottom
      })).toBeCloseTo(24, 1)
      state.profileReady = false
      await load()
      expect(await page.getByRole('status').evaluate((element) => {
        const placeholders = element.querySelectorAll('[data-variant]')
        return { groups: placeholders[1]!.getBoundingClientRect().top - placeholders[0]!.getBoundingClientRect().bottom,
          rows: placeholders[2]!.getBoundingClientRect().top - placeholders[1]!.getBoundingClientRect().bottom }
      })).toEqual({ groups: 24, rows: 12 })
    } finally { await page.close() }
  })
})
