import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError } from '@orbit/shared/utils'
import { progressStreakNow, progressStreakStates } from '@orbit/shared/__tests__/progress-streak-fixtures'
import { deriveStreakFreezeState } from '@orbit/shared/utils/gamification-selectors'
import { createMockAchievement } from '@orbit/shared/__tests__/factories'
import type { StreakInfo } from '@orbit/shared/types/gamification'
import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'
import { useUIPreferencesReadiness, useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  flag: true,
  retrospective: {} as Record<string, unknown>,
  refetch: vi.fn(),
  freeze: {} as Record<string, unknown>,
  repairMutate: vi.fn(),
  repair: { isPending: false, isError: false, error: null as unknown },
  canView: true,
  achievements: [] as unknown[],
  captureEvent: vi.fn(),
  captureCompleted: vi.fn(),
}))

vi.mock('@/hooks/use-flag', () => ({ useFlag: (key: string) => key === 'orbit_guided_flows' && mocks.flag }))
vi.mock('next/navigation', () => ({ usePathname: () => '/progress', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/navigation/root-notification-header', () => ({ RootNotificationHeader: () => <header data-root-notification-header="" /> }))
vi.mock('@/components/share/share-card-entry-button', () => ({ ShareCardEntryButton: () => <button type="button">share</button> }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: mocks.captureEvent, captureGuidedFlowCompleted: mocks.captureCompleted }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ refetch: mocks.refetch, ...mocks.retrospective }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', canViewGamification: mocks.canView, currentStreak: 4, longestStreak: 9 }, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    profile: { level: 2, totalXp: 150, xpForNextLevel: 200, currentStreak: 4, longestStreak: 9, achievements: mocks.achievements },
    xpProgress: 50, isLoading: false, isError: false, error: mocks.canView ? null : createApiClientError(403, { errorCode: 'PAY_GATE' }, 'Pro'), refetch: vi.fn(),
  }),
  useStreakFreeze: () => mocks.freeze,
  useRepairStreak: () => ({ ...mocks.repair, mutate: mocks.repairMutate, reset: vi.fn() }),
}))

const catalogs = { en, 'pt-BR': ptBR } as const

function day(date: string, completed: number, scheduled = 2) {
  return { startDate: date, endDate: date, scheduled, completed, completionRate: scheduled ? (completed / scheduled) * 100 : null }
}

function readyWindow(points = [day('2026-09-08', 1), day('2026-09-09', 2), day('2026-09-10', 1)], activeDays = 12) {
  return {
    isLoading: false, isError: false, error: null,
    data: {
      period: 'month', fromCache: false, narrative: { highlights: '', missed: '', trends: '', suggestion: '' },
      metrics: {
        completionRate: 75, totalCompletions: 18, totalScheduled: 24, activeDays, periodDays: 30, currentStreak: 4, bestStreak: 9, badHabitSlips: 0,
        weeklyConsistency: [10, 20, 30, 80, 50, 60, 70], topHabits: [{ name: 'Read', emoji: null, completionRate: 90, completedCount: 9, scheduledCount: 10, habitId: 'habit-1' }], needsAttention: [],
        completionSeries: { granularity: 'day', points },
      },
    },
  }
}

function setStreak(name: string, overrides: Partial<StreakInfo> = {}) {
  const streak = { ...progressStreakStates.find((state) => state.name === name)!.streak, ...overrides }
  mocks.freeze = { ...deriveStreakFreezeState(streak, null, '2026-09-10'), streakInfo: streak, streakQuery: { isError: false, refetch: vi.fn() } }
  return streak
}

function stubMedia(matching: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((feature) => query.includes(feature)), media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
}

function renderIn(locale: keyof typeof catalogs, node: ReactNode) {
  return render(<NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">{node}</NextIntlClientProvider>)
}

/** The line on screen. A replaced line can still be leaving through its fade, so the newest one is the last. */
function orbitLine(container: HTMLElement) {
  return [...container.querySelectorAll('[data-progress-orbit-line]')].at(-1) ?? null
}

function rootMascots(container: HTMLElement) {
  return [...container.querySelectorAll('[data-asset="orbit-mascot"][data-orbit-face="rig"]')].filter((element) => !element.closest('[hidden]'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(progressStreakNow))
  stubMedia([])
  mocks.flag = true
  mocks.canView = true
  mocks.retrospective = readyWindow()
  mocks.repair = { isPending: false, isError: false, error: null }
  mocks.achievements = []
  mocks.repairMutate.mockReset()
  mocks.captureCompleted.mockReset()
  mocks.refetch.mockReset()
  setStreak('ordinary')
  useUIStore.setState({ progressFiguresSeen: null })
  useUIPreferencesReadiness.setState({ ready: true })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Progresso root with orbit_guided_flows on', () => {
  it.each(['en', 'pt-BR'] as const)('draws one live Orbit at 96 above the line, then the question headings, in %s', (locale) => {
    const { container } = renderIn(locale, <ProgressContent />)
    const mascots = rootMascots(container)
    expect(mascots).toHaveLength(1)
    expect(mascots[0]).toHaveAttribute('width', '96')
    expect(mascots[0]).toHaveAttribute('data-orbit-state', 'parado')
    const copy = catalogs[locale].progressScreen
    expect(orbitLine(container)).toHaveTextContent(locale === 'en' ? 'You showed up on 12 of the last 30 days.' : 'Você apareceu em 12 dos últimos 30 dias.')
    expect(screen.getByRole('heading', { level: 2, name: copy.sections.windowQuestion })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: copy.sectionsQuestion })).toBeInTheDocument()
  })

  it('draws Orbit at 128 at 1024 and above', () => {
    stubMedia(['min-width: 1024px'])
    const { container } = renderIn('en', <ProgressContent />)
    expect(rootMascots(container)[0]).toHaveAttribute('width', '128')
  })

  it('keeps at most four figures, the habit row included, and no large streak numeral', () => {
    const { container } = renderIn('en', <ProgressContent />)
    expect(container.querySelectorAll('[data-state="default"], [data-state="empty"]').length + container.querySelectorAll('[data-testid="progress-top-habit"]').length).toBeLessThanOrEqual(4)
    expect(container.querySelector('[data-testid="progress-streak-figure"]')).toBeNull()
  })

  it('keeps every current control: the chart, the figures, the habit row, the share entry and the three rows with their routes', () => {
    renderIn('en', <ProgressContent />)
    expect(screen.getByRole('radiogroup', { name: en.progressScreen.window.chartLabel })).toBeInTheDocument()
    for (const label of [en.progressScreen.window.completionRate, en.progressScreen.window.activeDays, en.progressScreen.window.bestWeekday]) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByTestId('progress-top-habit')).toHaveAttribute('href', '/habits/habit-1')
    expect(screen.getByRole('button', { name: 'share' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Streak/ })).toHaveAttribute('href', '/progress/streak')
    expect(screen.getByRole('link', { name: /Goals/ })).toHaveAttribute('href', '/progress/goals')
    expect(screen.getByRole('link', { name: /Achievements/ })).toHaveAttribute('href', '/progress/achievements')
  })

  it('shows the skeleton while the window loads, with Orbit in Parado, no line and no spinner', () => {
    mocks.retrospective = { isLoading: true, isError: false, error: null }
    const { container } = renderIn('en', <ProgressContent />)
    expect(rootMascots(container)[0]).toHaveAttribute('data-orbit-state', 'parado')
    expect(orbitLine(container)).toBeNull()
    expect(screen.getAllByRole('progressbar', { name: en.progressScreen.loading }).length).toBeGreaterThan(0)
    expect(container.querySelector('.skeleton-pulse, [data-variant="stat-tile"]')).not.toBeNull()
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('shows the error with its retry icon and Orbit in Parado', () => {
    mocks.retrospective = { isLoading: false, isError: true, error: createApiClientError(500, { errorCode: 'INTERNAL_SERVER_ERROR' }, 'Server') }
    const { container } = renderIn('en', <ProgressContent />)
    expect(screen.getByRole('alert')).toHaveTextContent(en.progressScreen.error)
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.retry }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(rootMascots(container)[0]).toHaveAttribute('data-orbit-state', 'parado')
  })

  it.each(['en', 'pt-BR'] as const)('states the empty window as the line, with its one action, in %s', (locale) => {
    mocks.retrospective = { isLoading: false, isError: true, error: createApiClientError(400, { errorCode: 'NO_HABITS_FOR_PERIOD' }, 'Empty') }
    const { container } = renderIn(locale, <ProgressContent />)
    expect(orbitLine(container)).toHaveTextContent(catalogs[locale].progressScreen.orbit.empty)
    expect(within(container.querySelector('[data-progress-orbit]')!).getByRole('link', { name: catalogs[locale].progressScreen.window.emptyAction })).toHaveAttribute('href', '/')
    expect(rootMascots(container)).toHaveLength(1)
  })

  it('shows the lock card with its upgrade route, with Orbit in Parado and no line', () => {
    mocks.retrospective = { isLoading: false, isError: true, error: createApiClientError(403, { errorCode: 'PAY_GATE' }, 'Pro') }
    const { container } = renderIn('en', <ProgressContent />)
    expect(screen.getByTestId('progress-locked-card')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: en.progressScreen.window.lockedAction })).toHaveAttribute('href', '/upgrade')
    expect(orbitLine(container)).toBeNull()
    expect(container.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })

  it('states the return after a gap', () => {
    mocks.retrospective = readyWindow([day('2026-09-01', 1), ...['02', '03', '04', '05', '06', '07', '08', '09'].map((date) => day(`2026-09-${date}`, 0)), day('2026-09-10', 1)], 2)
    const { container } = renderIn('pt-BR', <ProgressContent />)
    expect(orbitLine(container)).toHaveTextContent(ptBR.progressScreen.orbit.returned)
  })
})

describe('Progresso root bar selection', () => {
  it('changes the line to the pressed day, moves the readout and starts no request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { container } = renderIn('en', <ProgressContent />)
    const bars = screen.getAllByRole('radio')
    const readout = container.querySelector('[data-slot="bar-chart-readout"]')!
    fireEvent.click(bars[0]!)
    expect(orbitLine(container)).toHaveTextContent('Tuesday, September 8: 1 of 2.')
    expect(readout).toHaveTextContent(/Tue.*Sep.*8/)
    expect(rootMascots(container)[0]).toHaveAttribute('data-orbit-state', 'olhando')
    fireEvent.click(bars[1]!)
    expect(orbitLine(container)).toHaveTextContent('Wednesday, September 9: 2 of 2.')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mocks.refetch).not.toHaveBeenCalled()
  })

  it('returns the default line on a second press of the same bar', () => {
    const { container } = renderIn('pt-BR', <ProgressContent />)
    const bar = screen.getAllByRole('radio')[1]!
    fireEvent.click(bar)
    expect(orbitLine(container)).toHaveTextContent('Quarta-feira, 9 de setembro: 2 de 2.')
    fireEvent.click(bar)
    expect(orbitLine(container)).toHaveTextContent('Você apareceu em 12 dos últimos 30 dias.')
    expect(rootMascots(container)[0]).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('returns the default line on a press outside the chart', () => {
    const { container } = renderIn('en', <ProgressContent />)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    fireEvent.pointerDown(document.body)
    expect(orbitLine(container)).toHaveTextContent('You showed up on 12 of the last 30 days.')
  })

  it('cross-fades the line and moves the readout, and keeps both still under reduced motion', () => {
    const { container, unmount } = renderIn('en', <ProgressContent />)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    expect(orbitLine(container)).toHaveAttribute('data-line-motion', 'fade')
    expect(container.querySelector('[data-slot="bar-chart-readout"]')).toHaveAttribute('data-readout-motion', 'selection')
    unmount()
    stubMedia(['prefers-reduced-motion: reduce'])
    const reduced = renderIn('en', <ProgressContent />)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    expect(orbitLine(reduced.container)).toHaveAttribute('data-line-motion', 'still')
    expect(reduced.container.querySelector('[data-slot="bar-chart-readout"]')).toHaveAttribute('data-readout-motion', 'still')
    expect(reduced.container.querySelector('[data-part="eyes"]')).toHaveAttribute('transform', expect.stringMatching(/^translate\(0 0\)/))
  })
})

describe('Progresso root figures since the last visit', () => {
  it('rolls nothing on a first visit and keeps the values it showed', () => {
    const { container } = renderIn('en', <ProgressContent />)
    expect(container.querySelector('[data-figure-motion]')).toBeNull()
    expect(useUIStore.getState().progressFiguresSeen).toEqual({ completionRate: 75, activeDays: 12, bestWeekday: 'thursday' })
  })

  it('rolls once only the figure that changed', () => {
    useUIStore.setState({ progressFiguresSeen: { completionRate: 75, activeDays: 11, bestWeekday: 'thursday' } })
    const { container } = renderIn('en', <ProgressContent />)
    const rolling = [...container.querySelectorAll('[data-figure-motion="roll"]')]
    expect(rolling).toHaveLength(1)
    expect(rolling[0]).toHaveTextContent('12')
  })

  it('keeps a changed figure still under reduced motion', () => {
    stubMedia(['prefers-reduced-motion: reduce'])
    useUIStore.setState({ progressFiguresSeen: { completionRate: 70, activeDays: 12, bestWeekday: 'thursday' } })
    const { container } = renderIn('en', <ProgressContent />)
    expect(container.querySelector('[data-figure-motion="roll"]')).toBeNull()
    expect(container.querySelector('[data-figure-motion="still"]')).toHaveTextContent('75%')
  })
})

describe('Progresso root with orbit_guided_flows off', () => {
  it('renders the current form', () => {
    mocks.flag = false
    const { container } = renderIn('en', <ProgressContent />)
    expect(container.querySelector('[data-progress-guided]')).toBeNull()
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: en.progressScreen.sections.window })).toBeInTheDocument()
  })
})

describe('Sequência with orbit_guided_flows on', () => {
  it.each(['en', 'pt-BR'] as const)('states the streak and the next freeze beside Orbit at 48, in %s', (locale) => {
    const { container } = renderIn(locale, <ProgressContent screen="streak" />)
    const mascots = rootMascots(container)
    expect(mascots).toHaveLength(1)
    expect(mascots[0]).toHaveAttribute('width', '48')
    expect(container.querySelector('[data-streak-orbit-line]')).toHaveTextContent(locale === 'en' ? '4 days in a row. 3 more days for the next freeze.' : '4 dias seguidos. Faltam 3 dias para o próximo congelamento.')
    expect(screen.getByTestId('progress-streak-figure')).toBeInTheDocument()
  })

  it('keeps the strip, the legend, the Freezes row and the freeze details in the sheet', async () => {
    setStreak('frozen today')
    renderIn('en', <ProgressContent screen="streak" />)
    expect(screen.getByRole('group', { name: /Activity/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Freezes/ }))
    const sheet = await screen.findByRole('dialog', { name: en.progressScreen.streak.freezes })
    await waitFor(() => expect(within(sheet).getByText(en.progressScreen.streak.frozenToday)).toBeInTheDocument())
    for (const label of [en.progressScreen.streak.banked, en.progressScreen.streak.used, en.progressScreen.streak.next, en.progressScreen.streak.longest, en.progressScreen.streak.protectedDays]) {
      expect(within(sheet).getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(within(sheet).getByRole('group', { name: en.progressScreen.streak.legend })).toBeInTheDocument()
  })

  it('says the gap sentence in Parado and shows the repair action on the screen', () => {
    setStreak('repair available')
    const { container } = renderIn('en', <ProgressContent screen="streak" />)
    expect(container.querySelector('[data-streak-orbit-line]')).toHaveTextContent('One day with nothing logged.')
    expect(rootMascots(container)[0]).toHaveAttribute('data-orbit-state', 'parado')
    expect(within(container.querySelector('[data-streak-repair]')!).getByRole('button', { name: /Repair/ })).toBeInTheDocument()
  })

  it.each([
    ['empty repair bank', en.progressScreen.streak.repairEmpty],
    ['partial repair bank', 'It needs 2 freezes, but only 1 is banked'],
    ['capped repair bank', 'cannot be repaired'],
  ])('keeps the %s case and offers no repair', (name, copy) => {
    setStreak(name)
    const { container } = renderIn('en', <ProgressContent screen="streak" />)
    const gap = container.querySelector<HTMLElement>('[data-streak-repair]')!
    expect(gap).toHaveTextContent(copy)
    expect(within(gap).queryByRole('button')).toBeNull()
  })

  it('keeps the bank-full notice in the freeze details', async () => {
    setStreak('full bank')
    const { container } = renderIn('en', <ProgressContent screen="streak" />)
    expect(container.querySelector('[data-streak-orbit-line]')).toHaveTextContent('4 days in a row.')
    fireEvent.click(screen.getByRole('button', { name: /Freezes/ }))
    const sheet = await screen.findByRole('dialog', { name: en.progressScreen.streak.freezes })
    expect(within(sheet).getByText(/3 freezes is the limit/)).toBeInTheDocument()
  })

  it('keeps the locked card and its upgrade action, with no Feliz state and no line', () => {
    mocks.canView = false
    const { container } = renderIn('en', <ProgressContent screen="streak" />)
    expect(screen.getByTestId('progress-locked-card')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: en.progressScreen.streak.lockedAction })).toHaveAttribute('href', '/upgrade')
    expect(container.querySelector('[data-orbit-state="feliz"]')).toBeNull()
    expect(container.querySelector('[data-streak-orbit-line]')).toBeNull()
  })
})

describe('Sequência repair flow', () => {
  function openRepair(locale: keyof typeof catalogs = 'en') {
    setStreak('partial repair bank', { streakFreezesAccumulated: 2, freezesAvailableToUse: 2 })
    const view = renderIn(locale, <ProgressContent screen="streak" />)
    fireEvent.click(within(view.container.querySelector('[data-streak-repair]')!).getByRole('button'))
    return view
  }

  it.each(['en', 'pt-BR'] as const)('asks one question that states what the repair does and what it costs, in %s', (locale) => {
    const { container } = openRepair(locale)
    const flow = container.querySelector('[data-question-flow]')!
    expect(within(flow as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent(locale === 'en' ? 'Save your streak with 2 freezes?' : 'Salvar a sequência com 2 congelamentos?')
    expect(within(flow as HTMLElement).getAllByRole('button', { pressed: false }).map((option) => option.textContent)).toEqual(
      [catalogs[locale].progressScreen.streak.repairFlow.repair, catalogs[locale].progressScreen.streak.repairFlow.notNow],
    )
    expect(container.querySelector('[data-progress-streak-summary]')!.closest('[hidden]')).not.toBeNull()
    expect(mocks.captureEvent).toHaveBeenCalledWith({ name: 'guided_flow_step_viewed', properties: { flow: 'streak_repair', step: 'repair', step_count: 1 } })
  })

  it('sends the same request as the confirm and closes with the result dialog and the count the server returned', async () => {
    openRepair()
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.streak.repairFlow.repair }))
    expect(mocks.repairMutate).toHaveBeenCalledWith(['2026-09-08', '2026-09-09'], expect.anything())
    const [, options] = mocks.repairMutate.mock.calls[0]!
    act(() => { options.onSuccess({ currentStreak: 7 }) })
    const dialog = await screen.findByRole('dialog', { name: en.result.title })
    expect(dialog).toHaveAccessibleDescription('Your streak is back to 7 days.')
    expect(dialog.querySelector('[data-orbit-state="feliz"]')).not.toBeNull()
    expect(mocks.captureCompleted).toHaveBeenCalledWith('streak_repair', 1, false)
    expect(document.querySelector('[data-question-flow]')).toBeNull()
  })

  it('closes on Not now with no request', () => {
    const { container } = openRepair()
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.streak.repairFlow.notNow }))
    expect(container.querySelector('[data-question-flow]')).toBeNull()
    expect(mocks.repairMutate).not.toHaveBeenCalled()
    expect(mocks.captureEvent).toHaveBeenCalledWith({ name: 'guided_flow_abandoned', properties: { flow: 'streak_repair', step: 'repair' } })
  })

  it.each([
    [500, en.progressScreen.streak.repairError],
    [429, en.progressScreen.streak.repairRateLimited],
  ])('keeps the flow open with the %s message and opens no dialog', (status, message) => {
    const { container, rerender } = openRepair()
    mocks.repair = { isPending: false, isError: true, error: createApiClientError(status, { errorCode: 'X' }, 'Error') }
    rerender(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><ProgressContent screen="streak" /></NextIntlClientProvider>)
    expect(within(container.querySelector('[data-question-flow]') as HTMLElement).getByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows no message on a conflict, as the confirm did', () => {
    const { container, rerender } = openRepair()
    mocks.repair = { isPending: false, isError: true, error: createApiClientError(409, { errorCode: 'CONFLICT' }, 'Conflict') }
    rerender(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><ProgressContent screen="streak" /></NextIntlClientProvider>)
    expect(container.querySelector('[data-question-flow] [role="alert"]')).toBeNull()
  })

  it('marks the chosen answer while the request runs and draws no spinner', () => {
    const { container, rerender } = openRepair()
    mocks.repair = { isPending: true, isError: false, error: null }
    rerender(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><ProgressContent screen="streak" /></NextIntlClientProvider>)
    expect(screen.getByRole('button', { name: en.progressScreen.streak.repairFlow.repair })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.streak.repairFlow.repair }))
    expect(mocks.repairMutate).not.toHaveBeenCalled()
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('slides no step and keeps the result dialog still under reduced motion', async () => {
    stubMedia(['prefers-reduced-motion: reduce'])
    openRepair()
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.streak.repairFlow.repair }))
    act(() => { mocks.repairMutate.mock.calls[0]![1].onSuccess({ currentStreak: 2 }) })
    const dialog = await screen.findByRole('dialog', { name: en.result.title })
    expect(dialog.querySelector('[data-orbit-turn="turning"]')).toBeNull()
    expect(dialog.querySelector('[data-orbit-loop="running"]')).toBeNull()
  })
})

describe('Conquistas with orbit_guided_flows on', () => {
  it('keeps the level row, the categories and the tiles, and a tile press changes nothing', () => {
    mocks.achievements = [createMockAchievement({ id: 'first_habit', category: 'GettingStarted', isEarned: true })]
    const { container } = renderIn('en', <ProgressContent screen="achievements" />)
    expect(screen.getByTestId('progress-xp-summary')).toBeInTheDocument()
    const tile = container.querySelector('[data-achievement-id="first_habit"]')!
    fireEvent.click(tile)
    expect(container.querySelector('[data-achievement-id="first_habit"]')).toBe(tile)
  })

  it('keeps the empty state with its action', () => {
    renderIn('en', <ProgressContent screen="achievements" />)
    expect(screen.getByText(en.progressScreen.achievements.empty)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: en.progressScreen.achievements.emptyAction })).toHaveAttribute('href', '/')
  })

  it('keeps the lock card with no Feliz state', () => {
    mocks.canView = false
    const { container } = renderIn('en', <ProgressContent screen="achievements" />)
    expect(screen.getByTestId('progress-locked-card')).toBeInTheDocument()
    expect(container.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })
})
