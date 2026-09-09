import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  repair: { mutate: vi.fn(), isPending: false, isError: false },
  reorder: { mutate: vi.fn() },
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
        topHabits: [{ name: 'Read', emoji: null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false }],
        needsAttention: [],
      },
      narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
      fromCache: false,
    },
    isLoading: false,
    isError: false,
    error: null as { data: { errorCode: string } } | null,
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
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: ({ goalId, inline, onOpenChange }: { goalId: string; inline?: boolean; onOpenChange: (open: boolean) => void }) => <div role={inline ? 'region' : 'dialog'} aria-label="goal-detail">{goalId}<button onClick={() => onOpenChange(false)}>Back to goals</button></div> }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => <span>PRO</span> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => mocks.account }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => mocks.goals,
  useReorderGoals: () => mocks.reorder,
  useUpdateGoalStatus: () => mocks.updateStatus,
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => mocks.gamification,
  useRepairStreak: () => mocks.repair,
  useStreakFreeze: (_profile: unknown, timeZone: unknown) => {
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
  useProgressRetrospective: () => mocks.retrospective,
}))

import ProgressPage from '@/app/(app)/progress/page'
import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'

describe('ProgressContent', () => {
  let textStyles: string

  beforeAll(async () => {
    const source = resolve('app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
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
      const card = screen.getByRole('button', { name: 'Read 12 Books' })
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
    const card = screen.getByRole('button', { name: 'Read 12 Books' })
    expect(within(card).queryByText('goals.status.active')).not.toBeInTheDocument()
    expect(card.querySelectorAll('[data-variant="solid"]')).toHaveLength(1)
    expect(within(card).queryByText(/^progressScreen\.goals\.daysOverdue(?::|$)/)).not.toBeInTheDocument()
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('keeps reached targets active with a done disc and opens detail from the whole card', () => {
    mocks.goals.data.allGoals = [createMockGoal({ progressPercentage: 100, currentValue: 12, trackingStatus: 'no_deadline' })]
    render(<ProgressPage />)
    const card = screen.getByRole('button', { name: 'Read 12 Books' })
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(card.querySelector('[data-status="done"]')).toBeInTheDocument()
    expect(within(card).getByText('progressScreen.goals.targetReached')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.goals.finish')).not.toBeInTheDocument()
    fireEvent.click(card)
    expect(screen.getByLabelText('goal-detail')).toHaveTextContent('goal-1')
    expect(mocks.updateStatus.mutate).not.toHaveBeenCalled()
  })

  it('shows an abandoned outline badge without progress and clears a distinct empty filter', () => {
    mocks.goals.data.allGoals = [createMockGoal({ status: 'Abandoned', progressPercentage: 100, trackingStatus: 'behind' })]
    render(<ProgressPage />)
    const card = screen.getByRole('button', { name: 'Read 12 Books' })
    expect(card.querySelector('[data-variant="outline"]')).toHaveTextContent('goals.status.abandoned')
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(card).queryByText((content) => content.startsWith('progressScreen.goals.progress'))).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'progressScreen.goals.completed' }))
    expect(screen.getByText('progressScreen.goals.filterEmpty')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.empty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.goals.clearFilter' }))
    expect(screen.getByRole('button', { name: 'Read 12 Books' })).toBeInTheDocument()
  })

  it.each(['mouse', 'touch'])('activates %s dragging after the threshold and writes only on release', async (pointerType) => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    render(<ProgressPage />)
    const card = screen.getByRole('button', { name: 'Read 12 Books' })
    const second = screen.getByRole('button', { name: 'Second' })
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
    expect(mocks.reorder.mutate).toHaveBeenCalledExactlyOnceWith([{ id: 'goal-2', position: 0 }, { id: 'goal-1', position: 1 }])
    fireEvent.click(card, { detail: 1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTime(50))
  })

  it('cancels touch drift, Escape and filtered reorders', async () => {
    vi.useFakeTimers()
    mocks.goals.data.allGoals = [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Second', position: 1 })]
    render(<ProgressPage />)
    const card = screen.getByRole('button', { name: 'Read 12 Books' })
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
    fireEvent.click(screen.getByRole('radio', { name: 'progressScreen.goals.active' }))
    fireEvent.mouseDown(card, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(document, { clientX: 0, clientY: 100 })
    fireEvent.mouseUp(document)
    fireEvent.keyDown(card, { altKey: true, key: 'ArrowDown' })
    expect(mocks.reorder.mutate).not.toHaveBeenCalled()
  })

  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    mocks.account.profile.timeZone = 'America/Sao_Paulo'
    vi.clearAllMocks()
    for (const query of [mocks.account, mocks.goals, mocks.gamification]) {
      query.isLoading = false
      query.isError = false
    }
    Object.assign(mocks.account.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150 })
    Object.assign(mocks.gamification.profile, { currentStreak: 4, longestStreak: 9, totalXp: 150, achievementsEarned: 0 })
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = true
    mocks.goals.data.allGoals = []
    mocks.gamification.profile.achievements = []
    mocks.freeze.isFrozenToday = false
    mocks.freeze.streakInfo.recentFreezeDates = []
    mocks.freeze.streakInfo.lastActiveDate = null
    mocks.freeze.streakInfo.isRepairAvailable = false
    mocks.freeze.streakInfo.repairDate = null
    mocks.freeze.streakQuery.isError = false
    mocks.freeze.freezesAvailable = 2
    mocks.streakSnapshotZones = null
    mocks.retrospective.isLoading = false
    mocks.retrospective.isError = false
    mocks.retrospective.error = null
    mocks.retrospective.data.metrics.weeklyConsistency = [10, 20, 30, 80, 50, 60, 70]
    mocks.retrospective.data.metrics.topHabits = [{ name: 'Read', emoji: null, completionRate: 90, completedCount: 9, scheduledCount: 10, isOneTime: false }]
  })

  it.each(['account', 'goals', 'gamification'] as const)('renders the complete global skeleton while %s loads', (query) => {
    mocks[query].isLoading = true
    const { container } = render(<ProgressPage />)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByRole('progressbar', { name: 'progressScreen.loading' })).toHaveAttribute('aria-busy', 'true')
    expect(Array.from(container.querySelectorAll('[data-variant]')).map((unit) => unit.getAttribute('data-variant'))).toEqual([
      'settings', 'settings', 'stat-tile', 'stat-tile', 'stat-tile', 'stat-tile', 'habit-row', 'habit-row', 'habit-row',
    ])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
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
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.retry' }))
    for (const request of [mocks.account, mocks.goals, mocks.gamification]) expect(request.refetch).toHaveBeenCalledTimes(1)
    mocks[query].isError = false
    rerender(<ProgressPage />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
  })

  it('shows a retryable error even while another resource is loading', () => {
    mocks.account.isError = true
    mocks.goals.isLoading = true
    render(<ProgressPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('progressScreen.error')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('does not retry a disabled gamification query', () => {
    mocks.account.profile.canViewGamification = false
    mocks.goals.isError = true
    render(<ProgressPage />)
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.retry' }))
    expect(mocks.account.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.goals.refetch).toHaveBeenCalledTimes(1)
    expect(mocks.gamification.refetch).not.toHaveBeenCalled()
  })

  it.each([false, true])('renders one orbital empty invitation for Pro access %s', (hasProAccess) => {
    mocks.account.profile.hasProAccess = hasProAccess
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    const { container } = render(<ProgressPage />)
    expect(screen.getByText('progressScreen.empty')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-mark="orbit"]')).toHaveLength(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'progressScreen.emptyAction' }))
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/')
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it.each(['goal', 'longestStreak', 'xp', 'achievement'] as const)('keeps existing %s records visible after the current streak resets', (record) => {
    Object.assign(mocks.account.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    Object.assign(mocks.gamification.profile, { currentStreak: 0, longestStreak: 0, totalXp: 0 })
    if (record === 'goal') mocks.goals.data.allGoals = [createMockGoal()]
    if (record === 'longestStreak') mocks.account.profile.longestStreak = 9
    if (record === 'xp') mocks.account.profile.totalXp = 150
    if (record === 'achievement') mocks.gamification.profile.achievementsEarned = 1
    render(<ProgressPage />)
    expect(screen.queryByText('progressScreen.empty')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
  })

  it('renders the four sections in the decided descending order and the API figures', () => {
    render(<ProgressContent />)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'progressScreen.sections.streak',
      'progressScreen.sections.goals',
      'progressScreen.sections.window',
      'progressScreen.sections.achievements',
    ])
    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    const figures = Array.from(windowSection.querySelectorAll('[data-state]')).map((figure) => figure.textContent)
    expect(figures).toEqual([
      '75%progressScreen.window.completionRate',
      '12progressScreen.window.activeDays',
      'dates.daysLong.thursdayprogressScreen.window.bestWeekday',
      'ReadprogressScreen.window.topHabit',
    ])
  })

  it('renders the remaining routed boundaries instead of blank gated regions', () => {
    mocks.account.profile.canViewGamification = false
    mocks.account.profile.hasProAccess = false
    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.lockedBody')).toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.achievements.lockedBody')).not.toBeInTheDocument()
    expect(screen.getAllByText('progressScreen.streak.lockedAction').length).toBeGreaterThan(0)
    expect(screen.getByText('progressScreen.streak.longest')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.detail.tierTileLabel')).toBeInTheDocument()
  })

  it('keeps free gamification cohorts open while locking only the Pro figures', () => {
    mocks.account.profile.canViewGamification = true
    mocks.account.profile.hasProAccess = false

    render(<ProgressContent />)

    expect(screen.getByText('progressScreen.streak.currentLabel:{"count":4}')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    expect(screen.getByText('progressScreen.window.lockedBody')).toBeInTheDocument()
    expect(screen.queryByText('progressScreen.streak.lockedBody')).not.toBeInTheDocument()
    expect(screen.queryByText('progressScreen.achievements.lockedBody')).not.toBeInTheDocument()
    const route = screen.getAllByRole('button', { name: 'progressScreen.window.lockedAction' })
    expect(route).toHaveLength(1)
    fireEvent.click(route[0]!)
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/upgrade')
  })

  it('renders empty weekly and habit figures without substituting unrelated totals', () => {
    mocks.retrospective.data.metrics.weeklyConsistency = []
    mocks.retrospective.data.metrics.topHabits = []

    render(<ProgressContent />)

    const windowSection = screen.getByRole('region', { name: 'progressScreen.sections.window' })
    expect(windowSection.querySelectorAll('[data-state="empty"]')).toHaveLength(2)
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
    expect(unearnedMark).toHaveAttribute('data-state', 'unearned')
    expect(within(earned as HTMLElement).getByText('progressScreen.achievements.earnedLabel')).toBeInTheDocument()
    expect(screen.queryByText('gamification.achievements.first_friend.name')).not.toBeInTheDocument()
  })

  it('offers the one day repair', () => {
    mocks.freeze.streakInfo.isRepairAvailable = true
    mocks.freeze.streakInfo.repairDate = '2026-08-27'
    mocks.goals.data.allGoals = [{
      id: 'goal-1',
      title: 'Read 10 books',
      description: null,
      targetValue: 10,
      currentValue: 10,
      unit: 'books',
      status: 'Active',
      deadline: null,
      position: 0,
      createdAtUtc: '2026-08-01T00:00:00Z',
      completedAtUtc: null,
      progressPercentage: 100,
      linkedHabits: [],
    }]
    render(<ProgressContent />)

    fireEvent.click(screen.getByText('progressScreen.streak.repairAction'))
    expect(mocks.repair.mutate).toHaveBeenCalledTimes(1)
  })

  it('keeps the page open when the Pro figures report no habits', () => {
    const retrospectiveData = mocks.retrospective.data
    mocks.retrospective.data = null as unknown as typeof mocks.retrospective.data
    mocks.retrospective.isError = true
    mocks.retrospective.error = { data: { errorCode: 'NO_HABITS_FOR_PERIOD' } }

    render(<ProgressContent />)

    expect(screen.getByRole('heading', { name: 'progressScreen.sections.streak' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'progressScreen.sections.goals' })).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()

    mocks.retrospective.data = retrospectiveData
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
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    expect(screen.queryByText('progressScreen.streak.frozenToday')).not.toBeInTheDocument()
    mocks.freeze.isFrozenToday = true
    rerender(<ProgressPage />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('progressScreen.streak.frozenToday')
    mocks.freeze.isFrozenToday = false
    rerender(<ProgressPage />)
    expect(screen.getByRole('status')).toBe(region)
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
    expect(screen.getByText('Sep 8')).toBeInTheDocument()
  })

  it('announces frozen today above the strip and includes its protected date', async () => {
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-07']
    const { container, rerender } = render(<ProgressPage />)
    await act(async () => { await Promise.resolve() })
    const banner = screen.getByRole('status')
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

  it('stage 5 opens inline detail and restores the filtered list on back', () => {
    mocks.goals.data.allGoals = [createMockGoal()]
    render(<ProgressPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'progressScreen.goals.active' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read 12 Books' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'progressScreen.sections.streak' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'goal-detail' })).toHaveTextContent('goal-1')
    fireEvent.click(screen.getByRole('button', { name: 'Back to goals' }))
    expect(screen.getByRole('radio', { name: 'progressScreen.goals.active' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Read 12 Books' })).toBeInTheDocument()
  })

  it('keeps the frozen banner, strip and protected-today marker on one timezone snapshot', async () => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    mocks.freeze.isFrozenToday = true
    mocks.freeze.streakInfo.recentFreezeDates = ['2026-09-08']
    mocks.streakSnapshotZones = new Set(['America/Sao_Paulo'])
    const { container, rerender } = render(<ProgressPage />)
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('status')).toHaveTextContent('progressScreen.streak.frozenToday')
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
