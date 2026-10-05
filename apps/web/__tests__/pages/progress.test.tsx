import { personalText } from '@/__tests__/support/personal-text'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createTranslator } from 'next-intl'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { ShellWide } from '@/components/shell/shell-wide'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  retrospectiveHook: vi.fn(),
  gamificationEnabled: vi.fn(),
  repair: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
  reorder: { mutate: vi.fn(), isPending: false, isError: false },
  updateStatus: { mutate: vi.fn(), isPending: false },
  account: {
    profile: { timeZone: 'America/Sao_Paulo', canViewGamification: true, hasProAccess: true, currentStreak: 4, longestStreak: 9, totalXp: 150 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  goals: {
    data: { allGoals: [] as Record<string, unknown>[] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  gamification: {
    profile: {
      totalXp: 150,
      level: 2,
      levelTitle: 'Explorer',
      xpForCurrentLevel: 100,
      xpForNextLevel: 200,
      xpToNextLevel: 50,
      achievementsEarned: 0,
      achievementsTotal: 0,
      achievements: [] as Record<string, unknown>[],
      userAchievements: [],
      currentStreak: 4,
      longestStreak: 9,
      lastActiveDate: null,
      isPro: true,
      achievementsLocked: false,
      nextReward: {
        nextLevel: 3,
        nextLevelTitle: 'Navigator',
        xpToNextLevel: 50,
        proTeaser: null,
      },
    },
    xpProgress: 50,
    isLoading: false,
    isError: false,
    error: { status: 500, data: { error: 'Server error', errorCode: 'INTERNAL_SERVER_ERROR' } },
    refetch: vi.fn(),
  },
  retrospective: {
    data: {
      period: 'month',
      metrics: {
        completionRate: 75,
        totalCompletions: 18,
        totalScheduled: 24,
        activeDays: 12,
        periodDays: 30,
        currentStreak: 4,
        bestStreak: 9,
        badHabitSlips: 0,
        weeklyConsistency: [10, 20, 30, 80, 50, 60, 70],
        topHabits: [{ name: 'Read', emoji: null as string | null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false, habitId: undefined as string | null | undefined }],
        needsAttention: [],
      },
      narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
      fromCache: false,
    },
    isLoading: false,
    isError: false,
    error: null as { status?: number; data: { errorCode: string } } | null,
    refetch: vi.fn(),
  },
  freeze: {
    streakInfo: {
      currentStreak: 4,
      longestStreak: 9,
      lastActiveDate: null as string | null,
      freezesUsedThisMonth: 1,
      freezesAvailable: 2,
      maxFreezesPerMonth: 3,
      isFrozenToday: false,
      recentFreezeDates: [] as string[],
      streakFreezesAccumulated: 2,
      maxStreakFreezesAccumulated: 3,
      daysUntilNextFreeze: 3,
      freezesAvailableToUse: 2,
      canEarnMore: true,
      isRepairAvailable: false,
      repairDate: null as string | null,
      repairableGapDates: undefined as string[] | undefined,
      lastFreezeCoveredDate: null as string | null,
      freezeBankRemaining: null as number | null,
    },
    streakQuery: { isError: false, refetch: vi.fn() },
    isFrozenToday: false,
    freezesAvailable: 2,
    streakFreezesAccumulated: 2,
    maxStreakFreezesAccumulated: 3,
    freezesUsedThisMonth: 1,
    maxFreezesPerMonth: 3,
    daysUntilNextFreeze: 3,
  },
  streakSnapshotZones: null as Set<string> | null,
  isDesktop: false,
  usePortugueseCatalog: false,
  useEnglishCatalog: false,
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useLocale: () => mocks.usePortugueseCatalog ? 'pt-BR' : 'en',
  useTranslations: () => mocks.usePortugueseCatalog
    ? createTranslator({ locale: 'pt-BR', messages: ptBR })
    : mocks.useEnglishCatalog ? createTranslator({ locale: 'en', messages: en }) : (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router, usePathname: () => '/progress' }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: ({ goalId, inline, onOpenChange }: { goalId: string; inline?: boolean; onOpenChange: (open: boolean) => void }) => <div role={inline ? 'region' : 'dialog'} aria-label="goal-detail">{goalId}<button onClick={() => onOpenChange(false)}>Back to goals</button></div> }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => <span>PRO</span> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => mocks.account }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => mocks.goals,
  useReorderGoals: () => mocks.reorder,
  useUpdateGoalStatus: () => mocks.updateStatus,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: (enabled?: boolean) => {
    mocks.gamificationEnabled(enabled)
    return mocks.gamification
  },
  useRepairStreak: () => mocks.repair,
  useStreakFreeze: (profile: { streakFreezesAvailable?: number }, timeZone: unknown, enabled = true) => {
    if (!enabled) return { ...mocks.freeze, streakInfo: null, streakFreezesAccumulated: profile.streakFreezesAvailable ?? 0 }
    if (!mocks.streakSnapshotZones || typeof timeZone !== 'string') return mocks.freeze
    if (mocks.streakSnapshotZones.has(timeZone)) return mocks.freeze
    return {
      ...mocks.freeze,
      streakInfo: null,
      isFrozenToday: false,
      streakQuery: { ...mocks.freeze.streakQuery, isError: false },
    }
  },
}))
vi.mock('@/hooks/use-retrospective', () => ({
  useProgressRetrospective: () => {
    mocks.retrospectiveHook()
    return mocks.retrospective
  },
}))
vi.mock('@/hooks/use-is-desktop', () => ({
  useIsWideDesktop: () => false, useIsDesktop: () => mocks.isDesktop }))

import ProgressPage from '@/app/(app)/progress/page'
import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

function captureGoalCardRendering(card: HTMLElement) {
  const elements = [card, ...card.querySelectorAll<HTMLElement>('*')]
  return {
    structure: card.outerHTML,
    styles: elements.map((element) => {
      const style = getComputedStyle(element)
      return Object.fromEntries(Array.from(style).sort((left, right) => left.localeCompare(right))
        .map((property) => [property, style.getPropertyValue(property)]))
    }),
  }
}

function getGoalCard(title: string): HTMLElement {
  return screen.getByRole('button', { name: (accessibleName) => accessibleName.includes(title) })
}

function getGoalCards(): HTMLElement[] {
  return screen.getAllByRole('button').filter((button) => button.hasAttribute('data-goal-id'))
}

function getStreakStatus(): HTMLElement {
  return within(screen.getByRole('region', { name: 'progressScreen.sections.streak' })).getByRole('status')
}

async function selectGoalFilter(view: string) {
  fireEvent.click(screen.getByRole('button', { name: /^progressScreen.goals.filter:/ }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: `progressScreen.goals.${view}` }))
  if (vi.isFakeTimers()) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  await waitFor(() => expect(screen.getByRole('button', { name: `progressScreen.goals.filter: progressScreen.goals.${view}` })).toBeInTheDocument())
}

describe('ProgressContent', () => {
  function renderPortugueseGoals() {
    mocks.usePortugueseCatalog = true
    mocks.goals.data.allGoals = [createMockGoal({ title: 'Ler doze livros' })]
    render(<ProgressContent />)
    return getGoalCard('Ler doze livros')
  }

  it('describes the actual goal keyboard shortcut in Portuguese', () => {
    const card = renderPortugueseGoals()
    const instructions = document.getElementById(card.getAttribute('aria-describedby')!)
    expect(instructions).toHaveTextContent('Alt')
    expect(instructions).toHaveTextContent('seta para cima ou para baixo')
    expect(instructions).not.toHaveTextContent('space bar')
  })

  it('localizes the sortable goal role in Portuguese', () => {
    const card = renderPortugueseGoals()
    expect(card).toHaveAttribute('aria-roledescription', 'item reordenável')
  })

  it('names the goal in Portuguese pointer drag start and end announcements', async () => {
    const card = renderPortugueseGoals()
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
    fireEvent.mouseDown(card, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
    const live = document.querySelector('[id^="DndLiveRegion"]')!
    await waitFor(() => expect(live).toHaveTextContent('Ler doze livros selecionado para mover.'))
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent('Ler doze livros solto'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
  })

  it.each(['en', 'pt-BR'])('announces a pointer return and unchanged drop in %s after an owner render', async (language) => {
    mocks.usePortugueseCatalog = language === 'pt-BR'
    mocks.useEnglishCatalog = language === 'en'
    const first = createMockGoal({ id: 'first', title: 'Ler doze livros', position: 0 })
    const second = createMockGoal({ id: 'second', title: 'Caminhar', position: 1 })
    mocks.goals.data.allGoals = [first, second]
    const { rerender } = render(<ProgressContent />)
    const card = getGoalCard(first.title)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
    vi.spyOn(getGoalCard(second.title), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80))
    const live = document.querySelector('[id^="DndLiveRegion"]')!
    fireEvent.mouseDown(card, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
    await waitFor(() => expect(live).toHaveTextContent(language === 'pt-BR' ? `${first.title} selecionado para mover.` : `${first.title} picked up to move.`))
    fireEvent.mouseMove(document, { clientX: 6, clientY: 100 })
    const previous = language === 'pt-BR' ? `${first.title} movido sobre ${second.title}.` : `${first.title} moved over ${second.title}.`
    await waitFor(() => expect(live).toHaveTextContent(previous))
    mocks.goals.data = { allGoals: [first, second] }
    rerender(<ProgressContent />)
    fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
    await waitFor(() => expect(live).toHaveTextContent(language === 'pt-BR' ? `${first.title} voltou para a posição inicial.` : `${first.title} is back in its starting position.`))
    expect(live).not.toHaveTextContent(previous)
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent(language === 'pt-BR' ? `${first.title} solto na posição inicial.` : `${first.title} dropped in its starting position.`))
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
    expect(getGoalCards()).toEqual([card, getGoalCard(second.title)])
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
  })

  let textStyles: string
  let stylesheet: string
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412].flatMap((width) => [false, true].map((locked) => ({ width, locked }))))(
    'keeps drawn streak captions on one line at $width with locked=$locked', async ({ width, locked }) => {
      mocks.account.profile.canViewGamification = !locked
      for (const [catalog, expected] of [[en, 'Longest streak'], [ptBR, 'Maior sequência']] as const) {
        mocks.useEnglishCatalog = catalog === en
        mocks.usePortugueseCatalog = catalog === ptBR
        const { container, unmount } = render(<ProgressContent />)
        const page = await browser.newPage({ viewport: { width, height: 1600 } })
        try {
          const streak = screen.getByRole('region', { name: catalog.progressScreen.sections.streak })
          expect(within(streak).getByText(expected)).toBeInTheDocument()
          expect(streak.querySelector('[data-component="freeze-bank"]') !== null).toBe(!locked)
          await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
          await loadAppFonts(page)
          const figures = page.getByRole('region', { name: catalog.progressScreen.sections.streak })
            .locator('[data-state="default"] > span')
          const geometry = await figures.evaluateAll((elements) => elements.map((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const text = range.getBoundingClientRect()
            const tile = element.parentElement!.getBoundingClientRect()
            const style = getComputedStyle(element)
            return { text: element.textContent, lines: range.getClientRects().length,
              width: text.width, available: tile.width - 32,
              clipped: style.overflow === 'hidden' || style.textOverflow === 'ellipsis',
              inside: text.left >= tile.left + 16 - 0.5 && text.right <= tile.right - 16 + 0.5 }
          }))
          expect(geometry).toHaveLength(4)
          for (const figure of geometry) {
            expect(figure.lines, figure.text!).toBe(1)
            expect(figure.clipped, figure.text!).toBe(false)
            expect(figure.inside, figure.text!).toBe(true)
            expect(figure.width, figure.text!).toBeLessThanOrEqual(figure.available + 0.5)
          }
          if (!locked) {
            const caption = page.getByText(catalog.progressScreen.streak.next, { exact: true })
            for (const scale of [1, 1.3, 2]) {
              await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale) }, scale)
              const bounds = await caption.evaluate((element) => {
                const range = document.createRange()
                range.selectNodeContents(element)
                const style = getComputedStyle(element)
                return { lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
                  clipped: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
                  overflow: style.overflow, textOverflow: style.textOverflow }
              })
              if (scale <= 1.3) expect(bounds.lines, JSON.stringify({ width, scale, bounds })).toBe(1)
              expect(bounds.clipped).toBe(false)
              expect(bounds.overflow).not.toBe('hidden')
              expect(bounds.textOverflow).not.toBe('ellipsis')
            }
          }
        } finally {
          await page.close()
          unmount()
          mocks.useEnglishCatalog = false
          mocks.usePortugueseCatalog = false
        }
      }
    },
  )

  it.each([320, 360, 384, 412])('clamps long goal titles to two lines at %ipx and opens their detail', async (width) => {
    for (const catalog of [en, ptBR]) {
      mocks.useEnglishCatalog = catalog === en
      mocks.usePortugueseCatalog = catalog === ptBR
      const titles = ['Ler os livros que escolhi para aprender uma nova habilidade', 'AprenderUmaNovaHabilidade'.repeat(5)]
      mocks.goals.data.allGoals = titles.map((title, index) => createMockGoal({ id: `long-${index}`, title, position: index }))
      const { container, unmount } = render(<ProgressContent />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.locator('[data-goal-id]').evaluateAll((cards) => cards.map((card) => {
          const title = card.querySelector('span')!.firstElementChild! as HTMLElement
          const metadata = title.nextElementSibling! as HTMLElement
          const style = getComputedStyle(title)
          return { height: title.getBoundingClientRect().height, lineHeight: Number.parseFloat(style.lineHeight),
            clamp: style.webkitLineClamp, overflow: style.overflow,
            clipped: title.scrollHeight > title.clientHeight || title.scrollWidth > title.clientWidth,
            overflowWidth: card.scrollWidth > card.clientWidth,
            metadataBelow: metadata.getBoundingClientRect().top >= title.getBoundingClientRect().bottom }
        }))
        expect(geometry).toHaveLength(2)
        for (const [index, title] of geometry.entries()) {
          expect(title.height).toBeCloseTo(title.lineHeight * (index === 0 ? 2 : 1), 0)
          expect(title.clamp).toBe(index === 0 ? '2' : 'none')
          expect(title.overflow).toBe('hidden')
          expect(title.overflowWidth).toBe(false)
          expect(title.metadataBelow).toBe(true)
        }
        const card = screen.getByRole('button', { name: new RegExp(titles[0]!) })
        expect(card.getAttribute('aria-label')).toContain(titles[0])
        fireEvent.click(card)
        expect(screen.getByLabelText('goal-detail')).toHaveTextContent('long-0')
      } finally {
        await page.close()
        unmount()
        mocks.useEnglishCatalog = false
        mocks.usePortugueseCatalog = false
      }
    }
  })

  it.each([1352, 1100, 840, 412].flatMap((width) => [false, true].map((panelOpen) => ({ width, panelOpen }))))(
    'keeps the content gutter at $width with conversation open=$panelOpen', async ({ width, panelOpen }) => {
      const matchMedia = window.matchMedia.bind(window)
      const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...matchMedia(query), matches: width >= 1024,
      }))
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        const { container } = render(
          <ShellWide items={[]} activeId="progresso" navLabel="Navigation"
            conversation={<button>Conversation</button>}
            conversationOpen={panelOpen} conversationLabel="Conversation">
            <ProgressPage />
          </ShellWide>,
        )
        await act(async () => {})
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const bounds = await page.evaluate(() => {
          const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          const column = scroller.getBoundingClientRect()
          const contentRight = column.left + scroller.clientWidth
          const section = document.querySelector('section')!.getBoundingClientRect()
          const goals = document.querySelector('h2:not(.sr-only)')!.getBoundingClientRect()
          const header = document.querySelector('[data-root-notification-header]')?.getBoundingClientRect()
          const bell = document.querySelector('[data-root-notification-header] button')?.getBoundingClientRect()
          return { left: section.left - column.left, right: contentRight - section.right, goalsLeft: goals.left - column.left,
            columnWidth: scroller.clientWidth, topInset: section.top - column.top, headerHeight: header?.height ?? 0,
            trailingInset: bell && bell.width > 0 ? contentRight - bell.right : null }
        })
        const gutter = (bounds.columnWidth - Math.min(bounds.columnWidth, 740)) / 2 + 16
        expect(bounds).toEqual({ left: gutter, right: gutter, goalsLeft: gutter, columnWidth: bounds.columnWidth,
          topInset: width < 1024 ? 96 : 16, headerHeight: width < 1024 ? 48 : 0,
          trailingInset: width < 1024 ? gutter : null })
      } finally {
        media.mockRestore()
        await page.close()
      }
    },
  )

  it('uses the display family for the streak and every freeze bank numeral', async () => {
    const { container } = render(<ProgressPage />)
    await act(async () => {})
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}:root { --font-space-grotesk: "Space Grotesk"; --font-geist: Geist; }</style>${container.innerHTML}`)
      const families = await page.evaluate(() => {
        const streak = document.querySelector('section p')!
        const bank = document.querySelector('[data-component="freeze-bank"]')!
        const card = bank.children[2]!
        const banked = card.querySelector('p')!
        const used = card.querySelectorAll('p')[2]!
        return [streak, banked, banked.querySelector('span')!, used].map((element) => getComputedStyle(element).fontFamily)
      })
      for (const family of families) expect(family).toContain('Space Grotesk')
    } finally {
      await page.close()
    }
  })

  it.each([
    { count: 0, label: 'dias seguidos' },
    { count: 1, label: 'dia seguido' },
    { count: 2, label: 'dias seguidos' },
  ])('renders the Portuguese streak figure at $count through next-intl', ({ count, label }) => {
    mocks.usePortugueseCatalog = true
    mocks.freeze.streakInfo.currentStreak = count
    try {
      render(<ProgressPage />)
      const streak = screen.getByRole('region', { name: ptBR.progressScreen.sections.streak })
      expect(within(streak).getByText(label).previousElementSibling).toHaveTextContent(String(count))
      expect(within(streak).queryByText(count === 1 ? 'dias seguidos' : 'dia seguido')).not.toBeInTheDocument()
    } finally {
      mocks.usePortugueseCatalog = false
    }
  })

  it('opens Progresso with its drawn sections and no Wrapped entry', () => {
    render(<ProgressPage />)
    expect(screen.queryByRole('button', { name: 'profile.wrappedTitle' })).not.toBeInTheDocument()
    expect(screen.queryByText('profile.wrappedHint')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('progressScreen.sections.streak')
  })

  beforeAll(async () => {
    const source = resolve('app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    stylesheet = compiled.css
    const rules: string[] = []
    compiled.root.walkRules((rule) => {
      if (rule.selector.startsWith('.text-')) {
        rule.walkDecls('color', (declaration) => { rules.push(`${rule.selector} { color: ${declaration.value}; }`) })
      }
    })
    textStyles = rules.join('\n')
  })

  it.each(['dark', 'light'] as const)('keeps goal metadata legible in every card state in %s', (mode) => {
    mocks.goals.data.allGoals = [createMockGoal()]
    render(<ProgressContent />)
    const stylesheet = document.createElement('style')
    stylesheet.textContent = textStyles
    document.head.append(stylesheet)
    try {
      const card = getGoalCard('Read 12 Books')
      const metadata = within(card).getByText((content) => content.startsWith('progressScreen.goals.progress'))
      const renderedColor = getComputedStyle(metadata).color
      const theme = resolveWebThemeVariables('purple', mode)
      const foreground = theme[renderedColor.slice(4, -1) as `--${string}`]!
      const surfaces = {
        default: [theme['--bg']!, theme['--bg-card']!],
        hover: [theme['--bg']!, theme['--bg-hover']!],
        pressed: [theme['--bg']!, theme['--bg-hover']!],
        dragged: [theme['--bg']!, theme['--bg-hover']!],
      }

      for (const [state, layers] of Object.entries(surfaces)) {
        expect(contrastOnSurface(foreground, layers), state).toBeGreaterThanOrEqual(4.5)
      }
    } finally {
      stylesheet.remove()
    }
  })

  it.each(['on_track', 'at_risk', 'behind', 'no_deadline'])('renders one neutral tracking badge for %s and no extra status or deadline', (trackingStatus) => {
    mocks.goals.data.allGoals = [createMockGoal({ trackingStatus, deadline: '2026-08-01' })]
    render(<ProgressPage />)
    const card = getGoalCard('Read 12 Books')
    expect(within(card).queryByText('goals.status.active')).not.toBeInTheDocument()
    expect(card.querySelectorAll('[data-variant="solid"]')).toHaveLength(1)
    expect(within(card).queryByText(/^progressScreen\.goals\.daysOverdue(?::|$)/)).not.toBeInTheDocument()
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('describes each goal state, progress and reorder position', () => {
    mocks.goals.data.allGoals = [
      createMockGoal({ id: 'active', title: 'Active goal', trackingStatus: 'on_track', position: 0 }),
      createMockGoal({ id: 'completed', title: 'Completed goal', status: 'Completed', currentValue: 8, targetValue: 10, progressPercentage: 80, position: 1 }),
      createMockGoal({ id: 'abandoned', title: 'Abandoned goal', status: 'Abandoned', position: 2 }),
      createMockGoal({ id: 'reached', title: 'Reached goal', currentValue: 10, targetValue: 10, progressPercentage: 100, position: 3 }),
    ]
    render(<ProgressPage />)

    expect(screen.getByRole('button', { name: /Active goal.*goals\.metrics\.onTrack.*current.*3.*position.*1.*total.*4/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Completed goal.*goals\.status\.completed.*current.*8.*position.*2.*total.*4/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abandoned goal.*goals\.status\.abandoned.*position.*3.*total.*4/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reached goal.*progressScreen\.goals\.targetReached.*current.*10.*position.*4.*total.*4/ })).toBeInTheDocument()
  })

  it('retargets an already-mounted goal card ring when progress changes', async () => {
    const goal = createMockGoal({ progressPercentage: 25 })
    mocks.goals.data.allGoals = [goal]
    const { rerender } = render(<ProgressPage />)
    const ring = within(getGoalCard(goal.title)).getByRole('progressbar')
    const sweep = ring.querySelector('circle:last-child')
    await waitFor(() => expect(sweep).toHaveClass('transition-[stroke-dashoffset]'))

    mocks.goals.data.allGoals = [{ ...goal, currentValue: 6, progressPercentage: 50 }]
    rerender(<ProgressPage />)

    const updatedRing = within(getGoalCard(goal.title)).getByRole('progressbar')
    expect(updatedRing).toBe(ring)
    expect(updatedRing).toHaveAttribute('aria-valuenow', '50')
    expect(updatedRing.querySelector('circle:last-child')).toBe(sweep)
    expect(sweep).toHaveClass('transition-[stroke-dashoffset]')
  })

  it('filters the same goal list through all four views', async () => {
    mocks.goals.data.allGoals = [
      createMockGoal({ id: 'active', title: 'Active goal', status: 'Active', position: 0 }),
      createMockGoal({ id: 'completed', title: 'Completed goal', status: 'Completed', position: 1 }),
      createMockGoal({ id: 'abandoned', title: 'Abandoned goal', status: 'Abandoned', position: 2 }),
    ]
    render(<ProgressPage />)

    expect(getGoalCards()).toHaveLength(3)
    for (const [view, visible] of [
      ['active', 'Active goal'],
      ['completed', 'Completed goal'],
      ['abandoned', 'Abandoned goal'],
    ] as const) {
      await selectGoalFilter(view)
      expect(getGoalCard(visible)).toBeInTheDocument()
      expect(getGoalCards()).toHaveLength(1)
    }
    await selectGoalFilter('all')
    expect(getGoalCards()).toHaveLength(3)
  })

  it('ignores goal colour, icon and emoji adornments from an oversized response', () => {
    const goal = createMockGoal()
    mocks.goals.data.allGoals = [goal]
    const { rerender } = render(<ProgressPage />)
    const unadorned = captureGoalCardRendering(getGoalCard(goal.title))
    mocks.goals.data.allGoals = [{ ...goal, color: 'blue', emoji: '🎯', icon: 'target' }]
    rerender(<ProgressPage />)
    const oversized = captureGoalCardRendering(getGoalCard(goal.title))

    expect.soft(oversized.structure).toBe(unadorned.structure)
    expect.soft(oversized.styles).toEqual(unadorned.styles)
  })

  it('keeps reached targets active with a done disc and opens detail from the whole card', () => {
    mocks.goals.data.allGoals = [createMockGoal({ progressPercentage: 100, currentValue: 12, trackingStatus: 'no_deadline' })]
    render(<ProgressPage />)
    const card = getGoalCard('Read 12 Books')
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(card.querySelector('[data-status="done"]')).toBeInTheDocument()
    expect(within(card).getByText('progressScreen.goals.targetReached')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.goals.finish')).not.toBeInTheDocument()
    fireEvent.click(card)
    expect(screen.getByLabelText('goal-detail')).toHaveTextContent('goal-1')
    expect(mocks.updateStatus.mutate).not.toHaveBeenCalled()
  })

  it('shows an abandoned outline badge without progress and clears a distinct empty filter', async () => {
    mocks.goals.data.allGoals = [createMockGoal({ status: 'Abandoned', progressPercentage: 100, trackingStatus: 'behind' })]
    render(<ProgressPage />)
    const card = getGoalCard('Read 12 Books')
    expect(card.querySelector('[data-variant="outline"]')).toHaveTextContent('goals.status.abandoned')
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(card).queryByText((content) => content.startsWith('progressScreen.goals.progress'))).not.toBeInTheDocument()
    await selectGoalFilter('completed')
    expect(screen.getByText('progressScreen.goals.filterEmpty')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.goals.empty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.goals.clearFilter' }))
    expect(getGoalCard('Read 12 Books')).toBeInTheDocument()
  })

  it.each(['mouse', 'touch'])('activates %s dragging after the threshold and writes only on release', async (pointerType) => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    render(<ProgressPage />)
    const card = getGoalCard('Read 12 Books')
    const second = getGoalCard('Second')
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80))
    const touch = (clientX: number, clientY: number) => ({ touches: [{ identifier: 1, clientX, clientY }], changedTouches: [{ identifier: 1, clientX, clientY }] })
    if (pointerType === 'touch') {
      fireEvent.touchStart(card, touch(0, 0))
      await act(() => vi.advanceTimersByTime(299))
      expect(card).not.toHaveAttribute('data-dragging', 'true')
      fireEvent.touchMove(card, touch(5, 0))
      await act(() => vi.advanceTimersByTime(1))
      fireEvent.touchMove(card, touch(0, 100))
    } else {
      fireEvent.mouseDown(card, { clientX: 0, clientY: 0, button: 0 })
      fireEvent.mouseMove(document, { clientX: 5, clientY: 0 })
      expect(card).not.toHaveAttribute('data-dragging', 'true')
      fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
      fireEvent.mouseMove(document, { clientX: 0, clientY: 100 })
    }
    expect(card).toHaveAttribute('data-dragging', 'true')
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
    if (pointerType === 'touch') fireEvent.touchEnd(card, touch(0, 100))
    else fireEvent.mouseUp(document)
    expect(mocks.reorder.mutate).toHaveBeenCalledExactlyOnceWith(
      [{ id: 'goal-2', position: 0 }, { id: 'goal-1', position: 1 }],
    )
    fireEvent.click(card, { detail: 1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTime(50))
  })

  it('cancels touch drift, Escape and filtered reorders', async () => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    render(<ProgressPage />)
    const card = getGoalCard('Read 12 Books')
    fireEvent.touchStart(card, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(card, { touches: [{ clientX: 6, clientY: 0 }] })
    await act(() => vi.advanceTimersByTime(300))
    expect(card).not.toHaveAttribute('data-dragging', 'true')
    fireEvent.touchEnd(card)
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
    fireEvent.mouseDown(card, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(document, { clientX: 0, clientY: 100 })
    expect(card).toHaveAttribute('data-dragging', 'true')
    fireEvent.keyDown(document, { code: 'Escape' })
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTime(50))
    vi.useRealTimers()
    await selectGoalFilter('active')
    expect(card).not.toHaveAttribute('aria-roledescription')
    fireEvent.mouseDown(card, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(document, { clientX: 0, clientY: 100 })
    fireEvent.mouseUp(document)
    fireEvent.keyDown(card, { altKey: true, key: 'ArrowDown' })
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
  })

  it('announces keyboard moves, boundaries and preserves errors and filtered state', async () => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal({ title: 'Goal one' }), createMockGoal({ id: 'goal-2', title: 'Goal two', position: 1 })]
    render(<ProgressPage />)
    const statuses = screen.getAllByTestId('goal-reorder-status')
    const firstGoal = screen.getByRole('button', { name: /Goal one/ })
    const secondGoal = screen.getByRole('button', { name: /Goal two/ })

    expect(statuses[0]).toBeEmptyDOMElement()
    expect(statuses[1]).toBeEmptyDOMElement()
    fireEvent.keyDown(firstGoal, { altKey: true, key: 'ArrowUp' })
    expect(statuses[0]).toHaveTextContent('progressScreen.goals.reorderBoundary:{"title":"Goal one","position":1,"total":2}')
    expect(statuses[1]).toBeEmptyDOMElement()
    await act(async () => { await Promise.resolve() })
    fireEvent.keyDown(firstGoal, { altKey: true, key: 'ArrowUp' })
    expect(statuses[0]).toBeEmptyDOMElement()
    expect(statuses[1]).toHaveTextContent('progressScreen.goals.reorderBoundary:{"title":"Goal one","position":1,"total":2}')
    fireEvent.keyDown(secondGoal, { altKey: true, key: 'ArrowDown' })
    expect(statuses[0]).toHaveTextContent('progressScreen.goals.reorderBoundary:{"title":"Goal two","position":2,"total":2}')
    expect(statuses[1]).toBeEmptyDOMElement()
    fireEvent.keyDown(secondGoal, { altKey: true, key: 'ArrowUp' })
    const moveUpOptions = mocks.reorder.mutate.mock.calls.at(-1)?.[1] as { onSuccess: () => void }
    act(() => moveUpOptions.onSuccess())
    expect(statuses[0]).toBeEmptyDOMElement()
    expect(statuses[1]).toHaveTextContent('progressScreen.goals.reorderMoved:{"title":"Goal two","position":1,"total":2}')
    fireEvent.keyDown(firstGoal, { altKey: true, key: 'ArrowDown' })
    const moveDownOptions = mocks.reorder.mutate.mock.calls.at(-1)?.[1] as { onSuccess: () => void }
    act(() => moveDownOptions.onSuccess())
    expect(statuses[0]).toHaveTextContent('progressScreen.goals.reorderMoved:{"title":"Goal one","position":2,"total":2}')
    expect(statuses[1]).toBeEmptyDOMElement()
    expect(screen.getAllByTestId('goal-reorder-status')).toEqual(statuses)

    mocks.reorder.isError = true
    vi.useRealTimers()
    await selectGoalFilter('active')
    expect(screen.getByRole('alert')).toHaveTextContent('progressScreen.goals.reorderError')
    expect(screen.getByRole('button', { name: /Goal one/ })).not.toHaveAttribute('aria-keyshortcuts')
    await selectGoalFilter('all')
  })

  it('replays the same boundary without timing between actions', () => {
    mocks.goals.data.allGoals = [createMockGoal({ title: 'Goal one' }), createMockGoal({ id: 'goal-2', title: 'Goal two', position: 1 })]
    render(<ProgressPage />)
    const statuses = screen.getAllByTestId('goal-reorder-status')
    const firstGoal = screen.getByRole('button', { name: /Goal one/ })

    expect(statuses).toHaveLength(2)
    expect(statuses[0]).toBeEmptyDOMElement()
    expect(statuses[1]).toBeEmptyDOMElement()
    fireEvent.keyDown(firstGoal, { altKey: true, key: 'ArrowUp' })
    expect(statuses[0]).toHaveTextContent('progressScreen.goals.reorderBoundary:{"title":"Goal one","position":1,"total":2}')
    expect(statuses[1]).toBeEmptyDOMElement()
    fireEvent.keyDown(firstGoal, { altKey: true, key: 'ArrowUp' })
    expect(statuses[0]).toBeEmptyDOMElement()
    expect(statuses[1]).toHaveTextContent('progressScreen.goals.reorderBoundary:{"title":"Goal one","position":1,"total":2}')
  })

  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    mocks.usePortugueseCatalog = false
    mocks.useEnglishCatalog = false
    useChatStore.setState({ draft: '', contextualSuggestion: null })
    useUIStore.getState().setAstraConversationOpen(false)
    mocks.account.profile.timeZone = 'America/Sao_Paulo'
    vi.clearAllMocks()
    for (const query of [mocks.account, mocks.goals, mocks.gamification]) {
      query.isLoading = false
      query.isError = false
    }
    mocks.gamification.error = {
      status: 500,
      data: { error: 'Server error', errorCode: 'INTERNAL_SERVER_ERROR' },
    }
    Object.assign(mocks.account.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150 })
    Object.assign(mocks.gamification.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150, achievementsEarned: 0 })
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = true
    mocks.goals.data.allGoals = []
    mocks.gamification.profile.achievements = []
    mocks.freeze.isFrozenToday = false
    Object.assign(mocks.freeze.streakInfo, {
      currentStreak: 4,
      recentFreezeDates: [],
      lastActiveDate: null,
      isRepairAvailable: false,
      repairDate: null,
      repairableGapDates: undefined,
      lastFreezeCoveredDate: null,
      freezeBankRemaining: null,
      streakFreezesAccumulated: 2,
      maxStreakFreezesAccumulated: 3,
      daysUntilNextFreeze: 3,
    })
    delete (mocks.freeze.streakInfo as typeof mocks.freeze.streakInfo & { lastFreezeCoveredOrigin?: string | null }).lastFreezeCoveredOrigin
    mocks.freeze.streakQuery.isError = false
    mocks.freeze.freezesAvailable = 2
    mocks.freeze.streakFreezesAccumulated = 2
    mocks.freeze.maxStreakFreezesAccumulated = 3
    mocks.freeze.daysUntilNextFreeze = 3
    mocks.repair.isError = false
    mocks.repair.error = null
    mocks.reorder.isPending = false
    mocks.reorder.isError = false
    mocks.isDesktop = false
    mocks.streakSnapshotZones = null
    mocks.retrospective.isLoading = false
    mocks.retrospective.isError = false
    mocks.retrospective.error = null
    mocks.retrospective.data.metrics.weeklyConsistency = [10, 20, 30, 80, 50, 60, 70]
    mocks.retrospective.data.metrics.topHabits = [{ name: 'Read', emoji: null as string | null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false, habitId: undefined }]
  })

  it.each(['account', 'goals', 'gamification'] as const)('renders the complete global skeleton while %s loads', async (query) => {
    mocks[query].isLoading = true
    const { container } = render(<ProgressPage />)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByRole('progressbar', { name: 'progressScreen.loading' })).toHaveAttribute('aria-busy', 'true')
    expect(Array.from(container.querySelectorAll('[data-variant]')).map((unit) => unit.getAttribute('data-variant'))).toEqual([
      'settings', 'settings', 'stat-tile', 'stat-tile', 'stat-tile', 'stat-tile', 'habit-row', 'habit-row', 'habit-row',
    ])
    expect(screen.queryByRole('button', { name: 'profile.wrappedTitle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    for (const width of [320, 412, 840]) {
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const spacing = await page.locator('[data-variant="stat-tile"]').first().evaluate((tile) => {
          const style = getComputedStyle(tile.parentElement!)
          return { row: style.rowGap, column: style.columnGap }
        })
        expect(spacing).toEqual({ row: '16px', column: '16px' })
      } finally {
        await page.close()
      }
    }
  })

  it.each(['loading', 'error', 'empty', 'populated'])('exposes one screen heading in the %s state', (state) => {
    mocks.account.isLoading = state === 'loading'
    mocks.account.isError = state === 'error'
    if (state === 'empty') {
      Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
      Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    }
    render(<ProgressPage />)
    expect(screen.getAllByRole('heading', { name: 'progressScreen.title', level: 1 })).toHaveLength(1)
  })

  it.each(['account', 'goals', 'gamification'] as const)('retries a global %s error with one action', (query) => {
    mocks[query].isError = true
    const { rerender } = render(<ProgressPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('progressScreen.error')
    expect(within(screen.getByRole('alert')).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.retry' }))
    for (const request of [mocks.account, mocks.goals, mocks.gamification]) expect(request.refetch).toHaveBeenCalledTimes(1)
    mocks[query].isError = false
    rerender(<ProgressPage />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
  })

  it.each([[false, 'primary'], [true, 'secondary']] as const)('renders the global retry for desktop=%s as a %s button', (isDesktop, variant) => {
    mocks.isDesktop = isDesktop
    mocks.account.isError = true
    render(<ProgressPage />)

    const retry = screen.getByRole('button', { name: 'progressScreen.retry' })
    expect(retry).toHaveAttribute('data-variant', variant)
  })

  it('shows a retryable error even while another resource is loading', () => {
    mocks.account.isError = true
    mocks.goals.isLoading = true
    render(<ProgressPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('progressScreen.error')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('leaves retry when gamification access is revoked after an error', () => {
    mocks.gamification.isError = true
    const { rerender } = render(<ProgressPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('progressScreen.error')

    mocks.account.profile.canViewGamification = false
    mocks.account.profile.hasProAccess = false
    rerender(<ProgressPage />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('progressScreen.streak.lockedBody')).toBeInTheDocument()
  })

  it('retries gamification when the account capability hint is false', () => {
    mocks.account.profile.canViewGamification = false
    mocks.goals.isError = true
    render(<ProgressPage />)
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.retry' }))
    expect(mocks.account.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.goals.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.gamification.refetch).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('renders one orbital empty invitation for Pro access %s', (hasProAccess) => {
    mocks.account.profile.hasProAccess = hasProAccess
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    const { container } = render(<ProgressPage />)
    expect(screen.getByText('progressScreen.goals.empty')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-mark="orbit"]')).toHaveLength(1)
    const action = screen.getByRole('button', { name: 'progressScreen.goals.createAction' })
    expect(action).toHaveAttribute('data-variant', 'primary')
    fireEvent.click(action)
    expect(useChatStore.getState().draft).toBe('progressScreen.goals.request')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it.each([[false, 'primary'], [true, 'secondary']] as const)('renders the global goal action for desktop=%s as a %s button', (isDesktop, variant) => {
    mocks.isDesktop = isDesktop
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    render(<ProgressPage />)

    expect(screen.getByRole('button', { name: 'progressScreen.goals.createAction' })).toHaveAttribute('data-variant', variant)
  })

  it('starts a goal request from the in-section goals-empty action', () => {
    render(<ProgressContent />)

    const action = screen.getByRole('button', { name: 'progressScreen.goals.createAction' })
    expect(action).toHaveAttribute('data-variant', 'primary')
    expect(within(screen.getByRole('region', { name: 'progressScreen.sections.goals' })).queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(action)
    expect(useChatStore.getState().draft).toBe('progressScreen.goals.request')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('keeps an unsent Astra draft when starting a goal', () => {
    useChatStore.getState().setDraft('Unsent note')
    const { rerender } = render(<ProgressContent />)

    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.goals.createAction' }))
    expect(useChatStore.getState().draft).toBe('Unsent note')
    expect(useChatStore.getState().contextualSuggestion).toEqual({
      id: 'progress-create-goal',
      label: 'progressScreen.goals.createAction',
      prompt: 'progressScreen.goals.request',
    })
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    mocks.goals.data.allGoals = [createMockGoal()]
    rerender(<ProgressContent />)
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
  })

  it.each(['goal', 'longestStreak', 'xp', 'achievement'] as const)('keeps existing %s records visible after the current streak resets', (record) => {
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    if (record === 'goal') mocks.goals.data.allGoals = [createMockGoal()]
    if (record === 'longestStreak') mocks.account.profile.longestStreak = 9
    if (record === 'xp') mocks.account.profile.totalXp = 150
    if (record === 'achievement') mocks.gamification.profile.achievementsEarned = 1
    render(<ProgressPage />)
    if (record === 'goal') expect(screen.queryByText('progressScreen.goals.empty')).not.toBeInTheDocument()
    else expect(screen.getByText('progressScreen.goals.empty')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
  })

  it('renders the four regions in order, each named once by its heading', () => {
    render(<ProgressContent />)

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'progressScreen.sections.streak',
      'progressScreen.sections.goals',
      'progressScreen.sections.window',
      'progressScreen.sections.achievements',
    ])
    expect(headings[3]!.className).toBe(headings[1]!.className)
    expect(headings[3]!.className).toBe(headings[2]!.className)
    const regions = screen.getAllByRole('region')
    expect(regions).toHaveLength(headings.length)
    for (const [index, region] of regions.entries()) {
      const heading = headings[index]!
      expect(heading.id).not.toBe('')
      expect(region).toHaveAttribute('aria-labelledby', heading.id)
      expect(region).not.toHaveAttribute('aria-label')
    }
    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    const figures = Array.from(windowSection.querySelectorAll('[data-state]')).map((figure) => figure.textContent)
    expect(figures).toEqual([
      '75%progressScreen.window.completionRate',
      '12progressScreen.window.activeDays',
      'dates.daysAbbreviated.thursdayprogressScreen.window.bestWeekday',
    ])
    for (const value of ['75%', '12', 'dates.daysAbbreviated.thursday']) {
      expect(within(windowSection).getByText(value)).toHaveStyle({ fontSize: 22, whiteSpace: 'nowrap' })
    }
  })

  it.each([320, 360, 384, 412])('keeps the owning Progress figures readable at %ipx with large text', async (width) => {
    for (const catalog of [en, ptBR]) {
      for (const habitId of [undefined, 'a08892c2-9a7c-4dc9-b70f-388be528420e']) {
      mocks.usePortugueseCatalog = catalog === ptBR
      mocks.useEnglishCatalog = catalog === en
      mocks.goals.data.allGoals = [createMockGoal()]
      const habitName = 'Read a very long chapter title before the morning conversation '.repeat(5)
      mocks.retrospective.data.metrics.topHabits[0]!.name = habitName
      mocks.retrospective.data.metrics.topHabits[0]!.emoji = '📚'
      mocks.retrospective.data.metrics.topHabits[0]!.habitId = habitId
      const { container, unmount } = render(<ProgressContent />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div style="width:${width}px;padding:0 16px">${container.innerHTML}</div>`)
        await loadAppFonts(page)
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll<HTMLElement>('div, span, p, button'))
          const sizes = elements.map((element) => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }))
          for (const { element, size, line } of sizes) { element.style.fontSize = `${size * 2}px`; if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px` }
        })
        const geometry = await page.locator('[data-state="default"] > span').evaluateAll((elements) => elements.map((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const bounds = range.getBoundingClientRect()
          const tile = element.parentElement!.getBoundingClientRect()
          return { text: element.textContent, lines: range.getClientRects().length, inside: bounds.left >= tile.left && bounds.right <= tile.right }
        }))
        const habit = await page.locator('[data-testid="progress-top-habit"]').evaluate((element) => {
          const content = element.closest('[data-personal-text-action]') ?? element
          const title = content.querySelector('[title]')!
          const style = getComputedStyle(title)
          const bounds = title.getBoundingClientRect()
          return { full: title.textContent, emoji: title.querySelector('[aria-hidden]')?.textContent, lines: bounds.height / parseFloat(style.lineHeight), title: title.getAttribute('title'), width: bounds.width, rowWidth: element.getBoundingClientRect().width, interactive: element.matches('a'), href: element.getAttribute('href'), labelLines: (() => { const range = document.createRange(); const visible = content.querySelector('[data-personal-text-content]') ?? content; range.selectNodeContents(visible.firstElementChild!.firstElementChild!); return range.getClientRects().length })() }
        })
        expect(habit.full).toContain(habitName)
        expect(habit.emoji).toContain('📚')
        expect(habit.title).toBe(habitName)
        expect(habit.lines).toBeLessThanOrEqual(2.1)
        expect(habit.width).toBe(habit.rowWidth - 32)
        expect(habit.interactive).toBe(!!habitId)
        expect(habit.href).toBe(habitId ? `/habits/${habitId}` : null)
        expect(habit.labelLines).toBe(1)
        expect(geometry).toHaveLength(10)
        for (const figure of geometry) { expect(figure.lines, figure.text!).toBe(1); expect(figure.inside, figure.text!).toBe(true) }
      } finally { await page.close(); unmount(); mocks.usePortugueseCatalog = false; mocks.useEnglishCatalog = false }
      }
    }
  })

  it('opens the top habit using the response id when ranked habits share a title', () => {
    const habitId = 'a08892c2-9a7c-4dc9-b70f-388be528420e'
    const topHabit = mocks.retrospective.data.metrics.topHabits[0]!
    const response = retrospectiveResponseSchema.parse({ ...mocks.retrospective.data,
      metrics: { ...mocks.retrospective.data.metrics, topHabits: [
        { ...topHabit, habitId },
        { ...topHabit, habitId: 'c61da295-ea54-409c-84ec-5e0dca97a73f' },
      ] },
    })
    Object.assign(topHabit, response.metrics.topHabits[0])
    render(<ProgressContent />)
    const row = screen.getByRole('link', { name: /Read/ })
    expect(row).toHaveAttribute('href', `/habits/${habitId}`)
    expect(row).toBe(screen.getByTestId('progress-top-habit'))
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([undefined, null])('keeps a top habit without an id static (%s)', (habitId) => {
    mocks.retrospective.data.metrics.topHabits[0]!.habitId = habitId
    render(<ProgressContent />)
    const row = screen.getByTestId('progress-top-habit')
    expect(row).not.toHaveAttribute('href')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('discloses the streak legend and keeps the top habit outside the figures', async () => {
    render(<ProgressContent />)
    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    expect(windowSection.querySelectorAll('[data-state="default"]')).toHaveLength(3)
    expect(within(windowSection).getByText('dates.daysAbbreviated.thursday')).toBeInTheDocument()
    const habit = within(windowSection).getByTestId('progress-top-habit')
    expect(habit).toHaveAccessibleName('progressScreen.window.topHabit, Read')
    expect(habit).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('progressScreen.streak.active')).not.toBeInTheDocument()
    const entry = screen.getByRole('button', { name: 'progressScreen.streak.legend' })
    entry.focus()
    fireEvent.click(entry)
    expect(screen.getByRole('dialog')).toHaveTextContent('progressScreen.streak.active')
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(entry).toHaveFocus()
    expect(habit).toHaveAccessibleName('progressScreen.window.topHabit, Read')
  })

  it('renders pay-gate refusals as the three locked sections', async () => {
    mocks.account.profile.hasProAccess = false
    Object.assign(mocks.account.profile, { streakFreezesAvailable: 3 })
    mocks.gamification.isError = true
    mocks.gamification.error = {
      status: 403,
      data: { error: 'Gamification is a Pro feature. Upgrade to unlock!', errorCode: 'PAY_GATE' },
    }
    mocks.retrospective.isError = true
    mocks.retrospective.error = { status: 403, data: { errorCode: 'PAY_GATE' } }
    render(<ProgressContent />)

    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
    expect(screen.getByText('progressScreen.streak.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.achievements.lockedBody')).toBeInTheDocument()
    expect(screen.getAllByText('progressScreen.streak.lockedAction').length).toBeGreaterThan(0)
    expect(screen.getByText('progressScreen.streak.longest')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.detail.tierTileLabel')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.bankFull:{"count":3}')).not.toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.gapTitle')).not.toBeInTheDocument()
    const route = screen.getAllByRole('link', { name: 'progressScreen.window.lockedAction' })
    expect(route).toHaveLength(1)
    expect(route[0]).toHaveAttribute('href', '/upgrade')
    expect(route[0]).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getAllByTestId('progress-locked-card')).toHaveLength(3)
    for (const card of screen.getAllByTestId('progress-locked-card')) {
      expect(card).toHaveClass('p-4', 'shadow-[inset_0_0_0_1px_var(--hairline-ghost)]')
      expect(within(card).getAllByRole('link')).toHaveLength(1)
    }
  })

  it('keeps the Pro window locked when free gamification succeeds but retrospective returns PAY_GATE', () => {
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = false
    mocks.retrospective.isError = true
    mocks.retrospective.error = {
      status: 403,
      data: { errorCode: 'PAY_GATE' },
    }

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.currentLabel:{"count":4}')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.achievements.lockedBody')).not.toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.lockedBody')).not.toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.getByTestId('progress-xp-summary')).toBeInTheDocument()
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
    expect(mocks.gamificationEnabled).toHaveBeenCalledWith(true)
  })

  it('renders a server-authorized window for a free account', () => {
    mocks.account.profile.hasProAccess = false

    render(<ProgressContent />)

    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    expect(within(windowSection).getByText('75%')).toBeInTheDocument()
    expect(within(windowSection).queryByText('progressScreen.window.lockedBody')).not.toBeInTheDocument()
  })

  it('renders a retryable window error when a free retrospective request fails', () => {
    mocks.account.profile.hasProAccess = false
    mocks.retrospective.isError = true
    mocks.retrospective.error = { status: 500, data: { errorCode: 'INTERNAL_SERVER_ERROR' } }

    render(<ProgressContent />)

    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    expect(within(windowSection).getByRole('alert')).toHaveTextContent('progressScreen.error')
    expect(within(windowSection).queryByText('progressScreen.window.lockedBody')).not.toBeInTheDocument()
    fireEvent.click(within(windowSection).getByRole('button', { name: 'progressScreen.retry' }))
    expect(mocks.retrospective.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders empty weekly and habit figures without substituting unrelated totals', () => {
    mocks.retrospective.data.metrics.weeklyConsistency = []
    mocks.retrospective.data.metrics.topHabits = []

    render(<ProgressContent />)

    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    expect(windowSection.querySelectorAll('[data-state="empty"]')).toHaveLength(1)
    expect(within(windowSection).queryByText('18')).not.toBeInTheDocument()
  })

  it('draws the XP row before grouped achievements and distinguishes earned shapes from progress', () => {
    mocks.gamification.profile.achievements = [
      {
        id: 'first_orbit', name: 'First orbit', description: 'Started', category: 'GettingStarted',
        rarity: 'Common', xpReward: 10, iconKey: 'first_orbit', isEarned: true,
        earnedAtUtc: '2026-08-01T00:00:00Z', progressCurrent: null, progressTarget: null,
      },
      {
        id: 'week_warrior', name: 'Week warrior', description: 'Seven days', category: 'GettingStarted',
        rarity: 'Common', xpReward: 20, iconKey: 'week_warrior', isEarned: false,
        earnedAtUtc: null, progressCurrent: 4, progressTarget: 7,
      },
      {
        id: 'dedicated', name: 'Dedicated', description: 'Keep going', category: 'Consistency',
        rarity: 'Rare', xpReward: 30, iconKey: 'dedicated', isEarned: true,
        earnedAtUtc: '2026-08-02T00:00:00Z', progressCurrent: 30, progressTarget: 30,
      },
      {
        id: 'first_friend', name: 'First friend', description: 'Social', category: 'Social',
        rarity: 'Common', xpReward: 10, iconKey: 'first_friend', isEarned: false,
        earnedAtUtc: null, progressCurrent: 0, progressTarget: 1,
      },
    ]

    render(<ProgressContent />)

    const xpSummary = screen.getByTestId('progress-xp-summary')
    const achievementsHeading = screen.getByRole('heading', { name: 'progressScreen.sections.achievements' })
    expect(xpSummary.compareDocumentPosition(achievementsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(within(xpSummary).getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.queryByText(/^progressScreen\.achievements\.next(?::|$)/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'gamification.categories.GettingStarted',
      'gamification.categories.Consistency',
    ])

    const earned = document.querySelector('[data-achievement-id="first_orbit"]')
    const progressive = document.querySelector('[data-achievement-id="week_warrior"]')
    const completedProgress = document.querySelector('[data-achievement-id="dedicated"]')
    expect(earned).not.toBeNull()
    expect(progressive).not.toBeNull()
    expect(completedProgress).not.toBeNull()
    expect(within(earned as HTMLElement).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(progressive as HTMLElement).getByRole('progressbar')).toBeInTheDocument()
    expect(within(completedProgress as HTMLElement).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    expect(within(completedProgress as HTMLElement).getByRole('progressbar')).toHaveAttribute('data-complete', 'true')
    const earnedMark = within(earned as HTMLElement).getByRole('img', {
      name: 'progressScreen.achievements.earnedState:{"name":"gamification.achievements.first_orbit.name"}',
    })
    const unearnedMark = within(progressive as HTMLElement).getByRole('img', {
      name: 'progressScreen.achievements.unearnedState:{"name":"gamification.achievements.week_warrior.name"}',
    })
    expect(earnedMark).toHaveAttribute('data-state', 'earned')
    expect(earnedMark).toHaveStyle({ background: 'var(--status-done)' })
    expect(earnedMark.style.boxShadow).toBe('')
    expect(unearnedMark).toHaveAttribute('data-state', 'unearned')
    expect(unearnedMark).toHaveStyle({ boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' })
    expect(unearnedMark.style.background).toBe('')
    expect(within(earned as HTMLElement).getByText('progressScreen.achievements.earnedLabel')).toBeInTheDocument()
    expect(screen.queryByText('gamification.achievements.first_friend.name')).not.toBeInTheDocument()
  })

  it('renders a weekly two-occurrence gap without an action after the streak restarts today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 1
    mocks.freeze.streakInfo.longestStreak = 4
    mocks.freeze.streakInfo.lastActiveDate = '2026-09-10'
    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.gapUnavailable')).toBeInTheDocument()
    expect(screen.queryByText(/^progressScreen\.streak\.repairAction/)).not.toBeInTheDocument()
    expect(mocks.repair.mutate).not.toHaveBeenCalled()
  })

  it('offers the server-confirmed one-day repair as a neutral small button at wide width', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.isDesktop = true
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'

    render(<ProgressContent />)

    const action = screen.getByText(personalText('progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}')).closest('button')
    expect(action).toHaveAttribute('data-variant', 'secondary')
    expect(action).toHaveAttribute('data-size', 'sm')
    fireEvent.click(action!)
    expect(mocks.repair.mutate).not.toHaveBeenCalled()
    expect(screen.getByText(personalText('progressScreen.streak.repairConfirmTitle:{"dates":"Wednesday, Sep 9"}'))).toBeInTheDocument()
    fireEvent.click(screen.getByText('progressScreen.streak.repairConfirmAction'))
    expect(mocks.repair.mutate).toHaveBeenCalledWith(['2026-09-09'])
  })

  it('keeps the goal action as the only filled action when streak repair is available', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    render(<ProgressContent />)

    expect(screen.getByRole('button', { name: 'progressScreen.goals.createAction' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByText(personalText('progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}')).closest('button')).toHaveAttribute('data-variant', 'secondary')
  })

  it('closes the goal detail when another account replaces the tab', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    mocks.goals.data.allGoals = [createMockGoal({})]
    render(<ProgressPage />)
    fireEvent.click(getGoalCard('Read 12 Books'))
    expect(screen.getByLabelText('goal-detail')).toHaveTextContent('goal-1')

    await replaceAccountWith('user-2')

    expect(screen.queryByLabelText('goal-detail')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('drops the repair confirmation when another account replaces the tab', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'

    render(<ProgressContent />)
    fireEvent.click(
      screen.getByText(personalText('progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}')),
    )
    expect(
      screen.getByText(personalText('progressScreen.streak.repairConfirmTitle:{"dates":"Wednesday, Sep 9"}')),
    ).toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(
      screen.queryByText(personalText('progressScreen.streak.repairConfirmTitle:{"dates":"Wednesday, Sep 9"}')),
    ).not.toBeInTheDocument()
    expect(mocks.repair.mutate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('shows the date and remaining bank after a freeze spend', () => {
    mocks.freeze.streakInfo.lastFreezeCoveredDate = '2026-09-15'
    mocks.freeze.streakInfo.freezeBankRemaining = 2

    render(<ProgressPage />)

    expect(screen.getByText(personalText('progressScreen.streak.covered:{"date":"Tuesday, Sep 15","count":2}'))).toBeInTheDocument()
  })

  it('names automatic coverage, then keeps a confirmed manual repair source-neutral', () => {
    mocks.freeze.streakInfo.lastFreezeCoveredDate = '2026-09-15'
    mocks.freeze.streakInfo.freezeBankRemaining = 2
    Object.assign(mocks.freeze.streakInfo, { lastFreezeCoveredOrigin: 'automatic' })
    const view = render(<ProgressPage />)
    expect(screen.getByText(personalText('progressScreen.streak.automaticCovered:{"date":"Tuesday, Sep 15","count":2}'))).toBeInTheDocument()

    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    mocks.repair.mutate.mockImplementationOnce(() => {
      Object.assign(mocks.freeze.streakInfo, {
        lastFreezeCoveredDate: '2026-09-09',
        freezeBankRemaining: 1,
        lastFreezeCoveredOrigin: 'manual',
        isRepairAvailable: false,
      })
    })
    view.rerender(<ProgressPage />)
    fireEvent.click(screen.getByText(personalText('progressScreen.streak.repairAction:{"dates":"Wednesday, Sep 9"}')))
    fireEvent.click(screen.getByText('progressScreen.streak.repairConfirmAction'))
    expect(mocks.repair.mutate).toHaveBeenCalledWith(['2026-09-09'])

    view.rerender(<ProgressPage />)
    expect(screen.getByText(personalText('progressScreen.streak.covered:{"date":"Wednesday, Sep 9","count":1}'))).toBeInTheDocument()
    expect(screen.queryByText(/progressScreen\.streak\.automaticCovered/)).not.toBeInTheDocument()
  })

  it('makes no automatic claim when a manual repair returns the same lastFreezeCoveredDate', () => {
    mocks.freeze.streakInfo.lastFreezeCoveredDate = '2026-09-09'
    mocks.freeze.streakInfo.freezeBankRemaining = 1
    mocks.freeze.streakInfo.isRepairAvailable = false
    Object.assign(mocks.freeze.streakInfo, { lastFreezeCoveredOrigin: 'manual' })

    render(<ProgressPage />)

    expect(screen.getByText(personalText('progressScreen.streak.covered:{"date":"Wednesday, Sep 9","count":1}'))).toBeInTheDocument()
    expect(screen.queryByText(/automaticCovered/)).not.toBeInTheDocument()
  })

  it.each([null, 'unknown'])('keeps %s freeze origin source-neutral', (origin) => {
    Object.assign(mocks.freeze.streakInfo, {
      lastFreezeCoveredDate: '2026-09-09',
      freezeBankRemaining: 1,
      lastFreezeCoveredOrigin: origin,
    })

    render(<ProgressPage />)

    expect(screen.getByText(personalText('progressScreen.streak.covered:{"date":"Wednesday, Sep 9","count":1}'))).toBeInTheDocument()
    expect(screen.queryByText(/automaticCovered/)).not.toBeInTheDocument()
  })

  it('states coverage without claiming who spent the freeze, in both locales', () => {
    for (const locale of [en, ptBR]) {
      const covered = locale.progressScreen.streak.covered
      expect(covered).toBeTypeOf('string')
      expect(covered).not.toMatch(/automatic|automátic|automatica|automaticamente/i)
    }
    expect(en.progressScreen.streak.covered).toBe(
      'A freeze covered {date}. {count, plural, =0 {None remain.} one {One remains.} other {# remain.}}',
    )
    expect(ptBR.progressScreen.streak.covered).toBe(
      'Um congelamento cobriu {date}. {count, plural, =0 {Nenhum resta.} one {Um resta.} other {# restam.}}',
    )
  })

  it('names automatic coverage for the covered date in both locales', () => {
    expect(createTranslator({ locale: 'en', messages: en })('progressScreen.streak.automaticCovered', { date: 'Tuesday, Sep 15', count: 2 }))
      .toBe('Orbit automatically covered Tuesday, Sep 15 with a freeze. 2 remain.')
    expect(createTranslator({ locale: 'pt-BR', messages: ptBR })('progressScreen.streak.automaticCovered', { date: 'terça-feira, 15 de set.', count: 2 }))
      .toBe('Orbit cobriu terça-feira, 15 de set. automaticamente com um congelamento. 2 restam.')
  })

  it('shows the no-freeze gap without an action or blame', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakInfo.repairableGapDates = ['2026-09-09']
    mocks.freeze.streakInfo.streakFreezesAccumulated = 0
    mocks.freeze.freezesAvailable = 0
    mocks.freeze.streakFreezesAccumulated = 0

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.gapBody:{"count":1}')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.streak.repairEmpty')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.repairAction:{"count":1}')).not.toBeInTheDocument()
  })

  it('shows a partly funded gap without offering an unaffordable repair', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakInfo.repairableGapDates = ['2026-09-07', '2026-09-08', '2026-09-09']
    mocks.freeze.streakInfo.streakFreezesAccumulated = 2
    mocks.freeze.freezesAvailable = 2
    mocks.freeze.streakFreezesAccumulated = 2

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.gapBody:{"count":3}')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.streak.repairPartial:{"needed":3,"banked":2}')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.repairAction:{"count":3}')).not.toBeInTheDocument()

    expect(createTranslator({ locale: 'en', messages: en })('progressScreen.streak.repairPartial', { needed: 3, banked: 2 }))
      .toBe('The gap is still open. It needs 3 freezes, but only 2 are banked. This repair offer ends today.')
    expect(createTranslator({ locale: 'pt-BR', messages: ptBR })('progressScreen.streak.repairPartial', { needed: 3, banked: 2 }))
      .toBe('A lacuna continua em aberto. Ela precisa de 3 congelamentos, mas só há 2 guardados. Esta oferta de reparo termina hoje.')
  })

  it('shows an unrepairable capped gap without promising another freeze', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakInfo.repairableGapDates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']
    mocks.freeze.streakInfo.streakFreezesAccumulated = 3
    mocks.freeze.freezesAvailable = 3
    mocks.freeze.streakFreezesAccumulated = 3
    mocks.freeze.maxStreakFreezesAccumulated = 3

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.repairCapped:{"needed":4,"banked":3}')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.repairPartial:{"needed":4,"banked":3}')).not.toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.repairAction:{"count":4}')).not.toBeInTheDocument()
  })

  it('shows the neutral bank limit and no next-freeze row', () => {
    mocks.freeze.streakInfo.streakFreezesAccumulated = 3
    mocks.freeze.streakFreezesAccumulated = 3

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.bankFull:{"count":3}')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.next')).not.toBeInTheDocument()
  })

  it.each([
    [429, 'progressScreen.streak.repairRateLimited'],
    [500, 'progressScreen.streak.repairError'],
  ])('names repair failure status %i honestly', (status, message) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    mocks.repair.isError = true
    mocks.repair.error = { status }

    render(<ProgressContent />)

    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  it.each(['dark', 'light'] as const)('keeps the gap repair error legible on its well in %s', (mode) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-09-09'
    mocks.repair.isError = true
    mocks.repair.error = { status: 500 }
    render(<ProgressContent />)
    const stylesheet = document.createElement('style')
    stylesheet.textContent = textStyles
    document.head.append(stylesheet)
    try {
      const renderedColor = getComputedStyle(screen.getByRole('alert')).color
      const theme = resolveWebThemeVariables('purple', mode)
      const foreground = theme[renderedColor.slice(4, -1) as `--${string}`]!
      expect(contrastOnSurface(foreground, [theme['--bg']!, theme['--bg-well']!])).toBeGreaterThanOrEqual(4.5)
    } finally {
      stylesheet.remove()
    }
  })

  it('does not render a failure after a repair conflict triggers read-back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'))
    mocks.freeze.streakInfo.currentStreak = 0
    mocks.freeze.streakInfo.lastActiveDate = '2026-09-07'
    mocks.repair.isError = true
    mocks.repair.error = { status: 409 }

    render(<ProgressContent />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the page invitation without requesting a window for a new account', () => {
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0, achievementsEarned: 0 })
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.goals.empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'progressScreen.goals.createAction' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.queryByText('progressScreen.window.empty')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.retrospectiveHook).not.toHaveBeenCalled()
    expect(mocks.retrospective.refetch).not.toHaveBeenCalled()
    expect(ptBR.progressScreen.goals.createAction).toBe('Criar meta')
    expect(en.progressScreen.goals.createAction).toBe('Create goal')
  })

  it('shows the window empty state when an account with progress has no habits in the period', () => {
    const retrospectiveData = mocks.retrospective.data
    mocks.retrospective.data = null as unknown as typeof mocks.retrospective.data
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    try {
      render(<ProgressContent />)

      expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
      expect(screen.getAllByText('progressScreen.window.empty')).toHaveLength(2)
      expect(screen.getByRole('link', { name: 'progressScreen.window.emptyAction' })).toHaveAttribute('data-variant', 'secondary')
      expect(screen.queryByText('0%')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(mocks.retrospectiveHook).toHaveBeenCalledTimes(1)
    } finally {
      mocks.retrospective.data = retrospectiveData
    }
  })

  it('shows streak loading and failure without a false upgrade boundary', () => {
    const streakInfo = mocks.freeze.streakInfo
    mocks.freeze.streakInfo = null as unknown as typeof mocks.freeze.streakInfo

    const { rerender } = render(<ProgressContent />)
    expect(screen.getByLabelText('progressScreen.loading')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.lockedBody')).not.toBeInTheDocument()

    mocks.freeze.streakQuery.isError = true
    rerender(<ProgressContent />)
    expect(screen.getByText('progressScreen.error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('progressScreen.retry'))
    expect(mocks.freeze.streakQuery.refetch).toHaveBeenCalledTimes(1)

    mocks.freeze.streakInfo = streakInfo
  })

  it('renders fourteen account days and exposes the bank on the owning page', () => {
    const { container } = render(<ProgressPage />)
    const strip = container.querySelector('[data-scope="account"]')!
    expect(strip.querySelectorAll('[data-state]')).toHaveLength(14)
    expect(strip.querySelector('[data-state="today"]')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.streak.banked')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.detail.tierTileLabel')).toBeInTheDocument()
  })

  it('lets all fourteen account days share the visible row', () => {
    const { container } = render(<ProgressPage />)
    const strip = container.querySelector('[data-scope="account"]')!
    const cells = strip.querySelectorAll('[data-state]')
    expect(cells).toHaveLength(14)
    expect(cells[13]).toHaveAttribute('aria-current', 'date')
    expect(strip).toHaveStyle({ width: '100%', minWidth: '0px', justifyContent: 'space-between', gap: '4px' })
    for (const cell of cells) expect(cell).toHaveStyle({ flexShrink: '1', minWidth: '0px' })
  })

  it.each([false, true])('stages a stable frozen status region when initially frozen is %s', async (initiallyFrozen) => {
    mocks.freeze.isFrozenToday = initiallyFrozen
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-07']
    const { rerender } = render(<ProgressPage />)
    const region = getStreakStatus()
    expect(region).toBeEmptyDOMElement()
    expect(screen.queryByText('progressScreen.streak.frozenToday')).not.toBeInTheDocument()
    mocks.freeze.isFrozenToday = true
    rerender(<ProgressPage />)
    await act(async () => { await Promise.resolve() })
    expect(getStreakStatus()).toBe(region)
    expect(region).toHaveTextContent('progressScreen.streak.frozenToday')
    mocks.freeze.isFrozenToday = false
    rerender(<ProgressPage />)
    expect(getStreakStatus()).toBe(region)
    expect(region).toBeEmptyDOMElement()
  })

  it.each([
    ['2026-09-09', '2026-09-08'],
    ['2026-09-08', '2026-09-07'],
  ])('labels the exact account day in history %j after timezone changes', async (...dates) => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = dates
    const { rerender } = render(<ProgressPage />)
    await act(async () => { await Promise.resolve() })
    expect.soft(screen.getByText('progressScreen.streak.protectedToday').parentElement).toHaveTextContent('Sep 8')
    mocks.account.profile.timeZone = 'Pacific/Kiritimati'
    rerender(<ProgressPage />)
    if (dates.includes('2026-09-09')) {
      expect(screen.getByText('progressScreen.streak.protectedToday').parentElement).toHaveTextContent('Sep 9')
    } else {
      expect(screen.queryByText('progressScreen.streak.protectedToday')).not.toBeInTheDocument()
    }
    expect(screen.getByText(personalText('Sep 8'))).toBeInTheDocument()
  })

  it('announces frozen today above the strip and includes its protected date', async () => {
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-07']
    const { container, rerender } = render(<ProgressPage />)
    await act(async () => { await Promise.resolve() })
    const banner = getStreakStatus()
    expect(banner).toHaveTextContent('progressScreen.streak.frozenToday')
    const strip = container.querySelector('[data-scope="account"]')!
    expect(banner.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(strip.lastElementChild).toHaveAttribute('data-state', 'frozen')
    expect(screen.getByText('progressScreen.streak.protectedToday')).toBeInTheDocument()
    mocks.freeze.isFrozenToday = false
    rerender(<ProgressPage />)
    expect(screen.queryByText('progressScreen.streak.frozenToday')).not.toBeInTheDocument()
    expect(strip.lastElementChild).toHaveAttribute('data-state', 'today')
  })

  it('stage 5 opens inline detail and restores the filtered list on back', async () => {
    mocks.goals.data.allGoals = [createMockGoal()]
    render(<ProgressPage />)
    await selectGoalFilter('active')
    fireEvent.click(getGoalCard('Read 12 Books'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'progressScreen.sections.streak' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'goal-detail' })).toHaveTextContent('goal-1')
    fireEvent.click(screen.getByRole('button', { name: 'Back to goals' }))
    expect(screen.getByRole('button', { name: 'progressScreen.goals.filter: progressScreen.goals.active' })).toBeInTheDocument()
    expect(getGoalCard('Read 12 Books')).toBeInTheDocument()
  })

  it('keeps the frozen banner, strip and protected-today marker on one timezone snapshot', async () => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-08']
    mocks.streakSnapshotZones = new Set(['America/Sao_Paulo'])
    const { container, rerender } = render(<ProgressPage />)
    await act(async () => { await Promise.resolve() })

    expect(getStreakStatus()).toHaveTextContent('progressScreen.streak.frozenToday')
    expect(container.querySelector('[data-scope="account"]')?.lastElementChild).toHaveAttribute('data-state', 'frozen')
    expect(screen.getByText('progressScreen.streak.protectedToday').parentElement).toHaveTextContent('Sep 8')

    mocks.account.profile.timeZone = 'Pacific/Kiritimati'
    rerender(<ProgressPage />)

    expect(screen.queryByText('progressScreen.streak.frozenToday')).not.toBeInTheDocument()
    expect(container.querySelector('[data-scope="account"]')).not.toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.protectedToday')).not.toBeInTheDocument()

    mocks.freeze.isFrozenToday = false
    mocks.freeze.streakInfo.recentFreezeDates = []
    mocks.streakSnapshotZones.add('Pacific/Kiritimati')
    rerender(<ProgressPage />)

    expect(screen.queryByText('progressScreen.streak.frozenToday')).not.toBeInTheDocument()
    expect(container.querySelector('[data-scope="account"]')?.lastElementChild).toHaveAttribute('data-state', 'today')
    expect(screen.queryByText('progressScreen.streak.protectedToday')).not.toBeInTheDocument()
  })

})

it('places the Progresso bell in scrolling root content and opens Avisos', () => {
  const { container } = render(<ProgressPage />)
  const row = container.querySelector('[data-root-notification-header]')!
  expect(row.parentElement).toHaveClass('flex-col')
  expect(row.parentElement).not.toHaveClass('sticky', 'fixed')
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'notifications.bell' }))
  expect(mocks.router.push).toHaveBeenCalledWith('/notifications')
})
