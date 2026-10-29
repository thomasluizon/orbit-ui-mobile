vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile, createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import type { ProactiveItem, Profile } from '@orbit/shared/types'
import type { NotificationItem } from '@orbit/shared/types/notification'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { TodayPageClient } from '@/app/(app)/today-page-client'
import { useTodayNavigation } from '@/app/(app)/use-today-navigation'
import { useHabitViewSearch } from '@/hooks/use-habit-view-search'
import type { ActiveView } from '@orbit/shared/stores'
import { DestinationShell } from '@/components/shell/destination-shell'
import { Composer } from '@/components/shell/composer'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({
  animate: vi.fn(
    (_value: unknown, _target: number, _transition?: { duration?: number }) => ({
      stop: vi.fn(),
    }),
  ),
  reducedMotion: false,
  wide: false,
  motionSets: [] as number[],
  lastCompletionDate: undefined as string | null | undefined,
  profileReady: true,
  checklistProfile: null as Profile | null,
  hasProAccess: true,
  timeZone: 'UTC',
  locale: 'en' as 'en' | 'pt-BR',
  summaryEnabled: true,
  summary: 'A walk is done. Reading is next.' as string | null,
  summaryLoading: false,
  summaryError: null as Error | null,
  notifications: [] as NotificationItem[],
  proactiveItem: null as ProactiveItem | null,
  view: {
    activeView: 'today' as ActiveView,
    isSelectMode: false,
    showCreateModal: false,
    listSurfaceOpen: false,
    data: {
      habitsById: new Map([['habit-1', { id: 'habit-1' }]]),
      filters: {},
      hasFetched: true,
      isFetching: false,
      isRefetching: false,
      showLoadError: false,
      habitsCount: 1,
    },
    habitListRef: { current: null },
    selectedHabitIds: new Set<string>(),
    selection: { handleToggleSelection: vi.fn() },
    setHabitListAllCollapsed: vi.fn(),
    setListSurfaceOpen: vi.fn(),
    setShowCreateModal: vi.fn(),
    showCompleted: false,
    toggleSelectMode: vi.fn(),
  },
}))

vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-08-29' }))
vi.mock('@/app/(app)/use-today-page', () => ({ useTodayPage: () => ({
  ...mocks.view, nav: useTodayNavigation('2026-08-29'),
  search: useHabitViewSearch(mocks.view.activeView), changeView: vi.fn(),
}) }))
vi.mock('@/app/(app)/today-page-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(app)/today-page-view')>()),
  TodayOverlays: () => null,
}))
vi.mock('@/components/habits/habit-list', () => ({
  HabitList: () => <div data-testid="today-habit-list" />,
}))
vi.mock('@/hooks/use-profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-profile')>()),
  useProfile: (options?: { initialData?: Profile }) => ({
    profile: options?.initialData ?? mocks.checklistProfile ?? (mocks.profileReady ? createMockProfile({ name: 'Account', email: 'account@example.test', timeZone: mocks.timeZone, lastCompletionDate: mocks.lastCompletionDate, hasProAccess: mocks.hasProAccess, aiSummaryEnabled: mocks.summaryEnabled, language: mocks.locale }) : undefined),
  }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: mocks.notifications }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-proactive-item', () => ({
  useProactiveItem: () => ({ item: mocks.proactiveItem, openItem: vi.fn() }),
}))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  const React = await import('react')
  const MotionDiv = ({
    children,
    style: _style,
    ...props
  }: {
    children?: React.ReactNode
    style?: unknown
    [key: string]: unknown
  }) => <div {...props}>{children}</div>

  return {
    ...actual,
    animate: mocks.animate,
    m: { div: MotionDiv },
    motion: { div: MotionDiv, span: actual.motion.span },
    useMotionValue: (initial: number) => {
      return React.useMemo(() => {
        let value = initial
        return {
          get: () => value,
          set: (next: number) => {
            value = next
            mocks.motionSets.push(next)
          },
        }
      }, [initial])
    },
    useReducedMotion: () => mocks.reducedMotion,
  }
})

vi.mock('@/hooks/use-summary', () => ({ useSummary: () => ({ summary: mocks.summary, isLoading: mocks.summaryLoading, isFetching: mocks.summaryLoading, error: mocks.summaryError, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))

function configureSlotState(state: string, locale: 'en' | 'pt-BR') {
        mocks.view.activeView = state === 'all' || state === 'general' ? state : 'today'
        mocks.locale = locale
        mocks.hasProAccess = state !== 'free'
        mocks.summaryEnabled = state !== 'none'
        mocks.summaryLoading = state === 'loading'
        mocks.summaryError = state === 'error' ? new Error('Unavailable') : null
        mocks.summary = locale === 'en' ? 'A walk is done. Reading is next.' : 'Você caminhou hoje. Ainda dá para ler.'
        mocks.proactiveItem = state === 'check-in' ? createMockProactiveItem() : null
        mocks.lastCompletionDate = state === 'returning' ? '2000-01-01' : null
}

describe('Hoje one Astra place at each shell width', () => {
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

  it.each([412, 1024, 1352].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('counts the real Hoje composition at $width in $locale', async ({ width, locale }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    mocks.wide = width >= 1024
    const messages = locale === 'en' ? en : ptBr
    try {
      for (const state of ['check-in', 'returning', 'loading', 'summary', 'error', 'free', 'none', 'all', 'general']) {
        configureSlotState(state, locale)
        const { container, unmount } = render(<NextIntlClientProvider locale={locale} messages={messages}>
          <DestinationShell onCreate={() => {}} composer={<Composer state="idle" value="" suggestions={[]} words={messages.shell.composer}
            onChangeValue={vi.fn()} onSend={vi.fn()} onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation} />}>
            <TodayPageClient initialToday="2026-08-29" initialHabits={null} />
          </DestinationShell>
        </NextIntlClientProvider>)
        try {
          const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value};`).join('')
          await page.setContent(`<style>${stylesheet}:root{${variables}}</style>${container.innerHTML}`)
          await page.evaluate(async () => { await document.fonts.ready })
          const geometry = await page.evaluate(() => {
            const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
            const glyphs = [...document.querySelectorAll('[data-asset^="astra-mark"]')].filter(visible)
            const slots = [...document.querySelectorAll('[data-today-astra-slot]')].filter(visible)
            const line = document.querySelector('.today-astra-line')
            const sentence = line?.querySelector('.today-astra-sentence')
            return {
              glyphs: glyphs.length, slots: slots.length,
              composerGlyphs: glyphs.filter(glyph => glyph.closest('[data-composer-root]')).length,
              entryGlyphs: glyphs.filter(glyph => glyph.closest('[data-open-conversation]')).length,
              sendGlyphs: glyphs.filter(glyph => glyph.closest('[data-composer-trailing-controls] > button')).length,
              slotGlyphs: slots[0]?.querySelectorAll('[data-asset^="astra-mark"]').length ?? 0,
              lineHeight: line?.getBoundingClientRect().height ?? 0,
              proseHeight: sentence?.getBoundingClientRect().height ?? 0,
              proseLineHeight: sentence ? parseFloat(getComputedStyle(sentence).lineHeight) : 0,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              retiredHeading: [...document.querySelectorAll('h2')].some((heading) => heading.textContent === 'Seu dia' || heading.textContent === 'Your day'),
            }
          })
          const slotAbsent = state === 'none' || state === 'all' || state === 'general'
          const shellGlyphs = 1
          const composerEntries = Number(!mocks.wide)
          const slotCount = Number(!slotAbsent)
          expect(geometry, state).toMatchObject({ glyphs: shellGlyphs + slotCount,
            composerGlyphs: composerEntries, entryGlyphs: composerEntries, sendGlyphs: 0,
            slots: slotCount, slotGlyphs: slotCount, overflow: false, retiredHeading: false })
          if (!mocks.wide) {
            const send = page.getByRole('button', { name: messages.shell.composer.send, exact: true })
            expect(await send.textContent()).toBe('')
            expect(await send.locator('svg.tabler-icon-arrow-up').count()).toBe(1)
          }
          if (!slotAbsent) {
            expect(geometry.lineHeight).toBeGreaterThanOrEqual(48)
            expect(geometry.proseHeight).toBeLessThanOrEqual(geometry.proseLineHeight * 2 + 1)
          }
        } finally { unmount() }
      }
    } finally { await page.close() }
  })
})
