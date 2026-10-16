import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { gamificationProfileFixture } from '../../test-support/hermetic/mock-api/fixtures/gamification'
import {
  matchesProgressGoalsRequest, progressGoalsEmptyGamification, progressGoalsEmptyPage,
  progressGoalsEmptyProfile, progressGoalsEmptyStreak,
} from '../../e2e/layout/progress-goals-empty-fixtures'
import { LAYOUT_ORIGIN } from '../../e2e/support/env'
import { fetchJson } from '@/lib/api-fetch'
import { PreloadedProfileContext } from '@/hooks/use-profile'
import GoalsPage from '@/app/(app)/progress/goals/page'
import AchievementsPage from '@/app/(app)/progress/achievements/page'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { expectLabelsFit, markRequiredLabels } from '../../e2e/layout/label-fit-contract'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/progress' }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: vi.fn() }))
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ syncThemeFromProfile: vi.fn(), detectAndSaveThemeIfNeeded: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ isLoading: true }) }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))

const clients: QueryClient[] = []
afterEach(() => { for (const client of clients.splice(0)) client.clear() })

function renderLayoutProgress(locale: 'en' | 'pt-BR', fullyEmpty = false, destination: 'goals' | 'achievements' = 'goals') {
  const profile = { ...progressGoalsEmptyProfile, language: locale,
    ...(fullyEmpty ? { currentStreak: 0, longestStreak: 0, totalXp: 0 } : {}) }
  const gamification = fullyEmpty ? gamificationProfileFixture : progressGoalsEmptyGamification
  vi.mocked(fetchJson).mockImplementation(async (path) => {
    if (path === API.profile.get) return profile
    if (path === API.gamification.profile) return gamification
    if (path === API.gamification.streak) return progressGoalsEmptyStreak
    if (matchesProgressGoalsRequest(new URL(path, LAYOUT_ORIGIN))) return progressGoalsEmptyPage
    throw new Error(`Unexpected Progress request: ${path}`)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  document.cookie = `i18n_locale=${locale}`
  return render(<QueryClientProvider client={client}>
    <PreloadedProfileContext.Provider value={profile}>
      <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
        {destination === 'goals' ? <GoalsPage /> : <AchievementsPage />}
      </NextIntlClientProvider>
    </PreloadedProfileContext.Provider>
  </QueryClientProvider>)
}

describe('Progress layout fixtures through the real page and query hooks', () => {
  it.each(['en', 'pt-BR'] as const)('reaches goal creation through its route and real query hook in %s', async (locale) => {
    const words = locale === 'en' ? en : ptBR
    const { container } = renderLayoutProgress(locale)
    await screen.findByText(words.progressScreen.goals.empty)
    expect(container.querySelector('[data-mark="orbit"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: words.progressScreen.goals.createAction })).toBeInTheDocument()
    await waitFor(() => expect(fetchJson).toHaveBeenCalledWith(`${API.goals.list}?pageSize=100`))
    expect(fetchJson).not.toHaveBeenCalledWith(API.gamification.streak, expect.anything())
  })

  it('keeps the orbital invitation when both profile producers have no progress', async () => {
    expect(profileFixture.currentStreak).toBe(0)
    expect(gamificationProfileFixture.currentStreak).toBe(0)
    const { container } = renderLayoutProgress('en', true)
    await screen.findByText(en.progressScreen.goals.empty)
    expect(container.querySelector('[data-mark="orbit"]')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: en.progressScreen.sections.goals })).not.toBeInTheDocument()
    expect(container.querySelector('[data-goals-empty]')).toBeNull()
  })

  it('keeps level and XP above the achievements empty invitation', async () => {
    const { container } = renderLayoutProgress('en', true, 'achievements')
    await screen.findByText(en.progressScreen.achievements.empty)
    expect(container.querySelector('[data-testid="progress-xp-summary"]')).toBeInTheDocument()
    expect(container.querySelector('[data-mark="orbit"]')).toBeInTheDocument()
  })

  it.each(['', '?pageSize=100', '?pageSize=100&page=2'])('matches the goals request with suffix %s', (suffix) => {
    expect(matchesProgressGoalsRequest(new URL(`${LAYOUT_ORIGIN}${API.goals.list}${suffix}`))).toBe(true)
    expect(matchesProgressGoalsRequest(new URL(`${LAYOUT_ORIGIN}${API.goals.list}/another${suffix}`))).toBe(false)
    expect(matchesProgressGoalsRequest(new URL(`https://example.com${API.goals.list}${suffix}`))).toBe(false)
  })
})

describe('Progress empty label geometry from the real page', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))(
    'keeps the goals empty invitation whole at $width in $locale', async ({ width, locale }) => {
      const words = locale === 'en' ? en : ptBR
      const { container } = renderLayoutProgress(locale)
      await screen.findByText(words.progressScreen.goals.empty)
      const page = await browser.newPage({ viewport: { width, height: 2000 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const title = page.getByText(words.progressScreen.goals.empty, { exact: true })
        await markRequiredLabels(title)
        await expectLabelsFit(page, title.locator('..'))
      } finally {
        await page.close()
      }
    },
  )
})
