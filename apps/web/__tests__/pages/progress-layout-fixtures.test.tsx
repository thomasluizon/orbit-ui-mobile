import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { createMockAchievement, createMockGoal } from '@orbit/shared/__tests__/factories'
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

function renderLayoutProgress(locale: 'en' | 'pt-BR', fullyEmpty = false, destination: 'goals' | 'achievements' = 'goals', achievementCount = 0) {
  const withAchievements = achievementCount > 0
  const profile = { ...progressGoalsEmptyProfile, language: locale,
    ...(fullyEmpty ? { currentStreak: 0, longestStreak: 0, totalXp: 0 } : {}) }
  const gamification = withAchievements ? {
    ...progressGoalsEmptyGamification,
    achievements: ['first_orbit', 'liftoff', 'mission_control'].slice(0, achievementCount).map((id, index) => createMockAchievement({ id, isEarned: index === 0 })),
    achievementsEarned: 1,
    achievementsTotal: achievementCount,
  } : fullyEmpty ? gamificationProfileFixture : progressGoalsEmptyGamification
  vi.mocked(fetchJson).mockImplementation(async (path) => {
    if (path === API.profile.get) return profile
    if (path === API.gamification.profile) return gamification
    if (path === API.gamification.streak) return progressGoalsEmptyStreak
    if (matchesProgressGoalsRequest(new URL(path, LAYOUT_ORIGIN))) return withAchievements ? { ...progressGoalsEmptyPage, items: [createMockGoal({ id: 'goal-1' }), createMockGoal({ id: 'goal-2' })], totalCount: 2 } : progressGoalsEmptyPage
    throw new Error(`Unexpected Progress request: ${path}`)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  document.cookie = `i18n_locale=${locale}`
  const catalog = locale === 'en' ? en : ptBR
  const firstOrbit = catalog.gamification.achievements.first_orbit
  const messages = withAchievements ? { ...catalog, gamification: { ...catalog.gamification, achievements: {
    ...catalog.gamification.achievements,
    first_orbit: { ...firstOrbit, name: Array(4).fill(firstOrbit.name).join(' '), description: Array(4).fill(firstOrbit.description).join(' ') },
  } } } : catalog
  return render(<QueryClientProvider client={client}>
    <PreloadedProfileContext.Provider value={profile}>
      <NextIntlClientProvider locale={locale} messages={messages}>
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

  it.each([412, 600, 840, 1352].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))(
    'fills responsive achievement columns at $width in $locale', async ({ width, locale }) => {
      const words = locale === 'en' ? en : ptBR
      const { container } = renderLayoutProgress(locale, false, 'achievements', 3)
      await waitFor(() => expect(container.querySelectorAll('[data-achievement-id]')).toHaveLength(3))
      const page = await browser.newPage({ viewport: { width, height: 2000 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => {
          const tiles = [...document.querySelectorAll('[data-achievement-id]')]
          const grid = tiles[0]!.parentElement!.getBoundingClientRect()
          return { width: grid.width, tiles: tiles.map((tile) => {
            const box = tile.getBoundingClientRect()
            return { left: box.left - grid.left, top: box.top, width: box.width, height: box.height, titleLines: tile.querySelector('p')!.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(tile.querySelector('p')!).lineHeight), overflow: tile.scrollWidth > tile.clientWidth }
          }) }
        })
        const columns = width === 412 ? 1 : 2
        expect(new Set(geometry.tiles.map((tile) => tile.left)).size).toBe(columns)
        expect(geometry.tiles[0]!.left).toBe(0)
        expect(geometry.tiles[columns - 1]!.left + geometry.tiles[columns - 1]!.width).toBeCloseTo(geometry.width, 0)
        for (const tile of geometry.tiles) expect(tile.overflow).toBe(false)
        expect(geometry.tiles[0]!.titleLines).toBeGreaterThan(1)
        expect(geometry.width).toBe(Math.min(width, 740) - 32)
        if (columns === 2) expect(geometry.tiles[0]!.height).toBe(geometry.tiles[1]!.height)
        const chip = page.getByText(words.progressScreen.achievements.earnedLabel, { exact: true })
        await markRequiredLabels(chip)
        await expectLabelsFit(page, chip.locator('..'))
      } finally { await page.close() }
    },
  )

  it.each([412, 600, 840, 1352].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))(
    'keeps goal cards at full content width at $width in $locale', async ({ width, locale }) => {
      const { container } = renderLayoutProgress(locale, false, 'goals', 3)
      await waitFor(() => expect(container.querySelectorAll('[data-goal-id]')).toHaveLength(2))
      const page = await browser.newPage({ viewport: { width, height: 2000 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const goalWidths = await page.locator('[data-goal-id]').evaluateAll((goals) => goals.map((goal) => ({ width: goal.getBoundingClientRect().width, available: goal.parentElement!.getBoundingClientRect().width })))
        expect(goalWidths).toHaveLength(2)
        for (const goal of goalWidths) expect(goal.width).toBe(goal.available)
      } finally { await page.close() }
    },
  )

  it('keeps a single achievement within its regular track', async () => {
    const { container } = renderLayoutProgress('pt-BR', false, 'achievements', 1)
    await waitFor(() => expect(container.querySelectorAll('[data-achievement-id]')).toHaveLength(1))
    const page = await browser.newPage({ viewport: { width: 1352, height: 2000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.locator('[data-achievement-id]').evaluate((tile) => ({
        width: tile.getBoundingClientRect().width, available: tile.parentElement!.getBoundingClientRect().width,
      }))
      expect(geometry.width).toBe((geometry.available - 16) / 2)
    } finally { await page.close() }
  })

})
