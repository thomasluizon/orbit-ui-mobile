import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
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
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: state.lineVisible ? [createMockNotification({ url: '/chat', body: 'Você pode beber um copo de água agora mesmo.', createdAtUtc: '2026-09-04T12:00:00Z' })] : [] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
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

  it.each([320, 412, 600, 840, 1024, 1352].flatMap((width) => (['dark', 'light'] as const).flatMap((mode) =>
    (['en', 'pt-BR'] as const).flatMap((locale) => ([320, 412, 840, 1352].includes(width) ? [1, 2] : [1]).map((textScale) => ({ width, mode, locale, textScale }))),
  )))('separates Hoje groups at $width in $mode and $locale with $textScale text scale', async ({ width, mode, locale, textScale }) => {
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
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${variables}}</style>${html}`)
      await page.evaluate(async ({ mode, textScale }) => {
        document.documentElement.className = mode
        document.documentElement.style.fontSize = `${16 * textScale}px`
        const sentence = document.querySelector<HTMLElement>('.today-astra-sentence')
        if (sentence) sentence.style.fontSize = `${Number.parseFloat(getComputedStyle(sentence).fontSize) * textScale}px`
        await document.fonts.ready
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        await Promise.all(document.getAnimations().map((animation) => animation.finished))
      }, { mode, textScale })
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
      expect.soft(spacing.lineToDate).toBeCloseTo(24 * textScale, 1)
      expect(spacing.dateToSummary).toBeCloseTo(24, 1)
      expect(spacing.summaryToList).toBeCloseTo(24, 1)
      expect(spacing.endClearance).toBeGreaterThanOrEqual(24)
      const line = page.locator('.today-astra-line')
      await line.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      const perimeter = await line.evaluate(async (element) => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        await Promise.all(document.getAnimations().map((animation) => animation.finished))
        const bounds = element.getBoundingClientRect()
        const scroller = element.closest<HTMLElement>('[data-shell-scroller]')!
        const client = scroller.getBoundingClientRect()
        const style = getComputedStyle(element)
        const extent = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
        return {
          focused: element === document.activeElement && element.matches(':focus-visible'),
          leftInset: bounds.left - client.left - scroller.clientLeft,
          rightInset: client.left + scroller.clientLeft + scroller.clientWidth - bounds.right,
          ringInside: bounds.left - extent >= client.left + scroller.clientLeft
            && bounds.right + extent <= client.left + scroller.clientLeft + scroller.clientWidth
            && bounds.top - extent >= client.top + scroller.clientTop
            && bounds.bottom + extent <= client.top + scroller.clientTop + scroller.clientHeight,
          outlineWidth: Number.parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle,
          inlineStart: Number.parseFloat(style.paddingInlineStart), inlineEnd: Number.parseFloat(style.paddingInlineEnd),
          blockStart: Number.parseFloat(style.paddingTop), blockEnd: Number.parseFloat(style.paddingBottom),
        }
      })
      expect(perimeter).toMatchObject({ focused: true, ringInside: true, outlineWidth: 2, outlineStyle: 'solid' })
      expect(perimeter.leftInset).toBeCloseTo(16, 1)
      expect(perimeter.rightInset).toBeCloseTo(16, 1)
      expect(perimeter.inlineStart).toBeGreaterThanOrEqual(8)
      expect(perimeter.inlineEnd).toBeGreaterThanOrEqual(8)
      expect(perimeter.blockStart).toBeGreaterThanOrEqual(4)
      expect(perimeter.blockEnd).toBeGreaterThanOrEqual(4)
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
      expect(await page.locator('[data-capacity-notice]').count()).toBe(0)
      expect(await page.evaluate(() => {
        const date = document.querySelector('[data-today-date-row]')!
        const list = document.querySelector('[data-testid="spacing-list-surface"]')!
        return list.getBoundingClientRect().top - date.getBoundingClientRect().bottom
      })).toBeCloseTo(24, 1)
      state.surface = 'list'
      for (const { date, message } of [
        { date: '2026-08-28', message: messages.habits.todayBoundary.lastLoggable },
        { date: '2026-08-27', message: messages.habits.todayBoundary.readOnly },
        { date: '2026-09-05', message: messages.habits.todayBoundary.future },
      ]) {
        state.date = date
        await load()
        const notice = page.locator('[data-capacity-notice]')
        expect(await notice.count()).toBe(1)
        expect(await notice.textContent()).toBe(message)
        const spacing = await page.evaluate(() => {
          const date = document.querySelector('[data-today-date-row]')!.getBoundingClientRect()
          const notice = document.querySelector('[data-capacity-notice]')!.getBoundingClientRect()
          const list = document.querySelector('[data-testid="spacing-list-surface"]')!.getBoundingClientRect()
          return { dateToNotice: notice.top - date.bottom, noticeToList: list.top - notice.bottom }
        })
        expect(spacing).toEqual({ dateToNotice: 24, noticeToList: 24 })
      }
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
