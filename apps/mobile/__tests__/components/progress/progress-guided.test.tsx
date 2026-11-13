import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError } from '@orbit/shared/utils'
import { progressStreakNow, progressStreakStates } from '@orbit/shared/__tests__/progress-streak-fixtures'
import { deriveStreakFreezeState } from '@orbit/shared/utils/gamification-selectors'
import { createMockAchievement } from '@orbit/shared/__tests__/factories'
import type { StreakInfo } from '@orbit/shared/types/gamification'
import { testI18n } from '@/__tests__/support/i18n'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { ProgressContent } from '@/components/progress/progress-content'
import { useUIPreferencesReadiness, useUIStore } from '@/stores/ui-store'
import { reanimatedTestState } from '../../../test-mocks/react-native-reanimated'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

const mocks = vi.hoisted(() => {
  const repair: { isPending: boolean; isError: boolean; error: unknown } = { isPending: false, isError: false, error: null }
  return {
  flag: true,
  reducedMotion: false,
  retrospective: {},
  refetch: vi.fn(),
  freeze: {},
  repairMutate: vi.fn(),
  repair,
  canView: true,
  gamificationLoading: false,
  achievements: [] as unknown[],
  push: vi.fn(),
  captureEvent: vi.fn(),
  captureCompleted: vi.fn(),
  }
})

vi.mock('@/hooks/use-flag', () => ({ useFlag: (key: string) => key === 'orbit_guided_flows' && mocks.flag }))
vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('expo-router', () => ({ usePathname: () => '/progress', useRouter: () => ({ push: mocks.push, dismissTo: vi.fn() }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/navigation/root-notification-header', () => ({ RootNotificationHeader: () => React.createElement('RootNotificationHeader') }))
vi.mock('@/components/share/share-card-entry-button', () => ({ ShareCardEntryButton: () => React.createElement('ShareEntry') }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: mocks.captureEvent, captureGuidedFlowCompleted: mocks.captureCompleted }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ refetch: mocks.refetch, ...mocks.retrospective }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', canViewGamification: mocks.canView, currentStreak: 4, longestStreak: 9 }, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    profile: { level: 2, totalXp: 150, xpForNextLevel: 200, currentStreak: 4, longestStreak: 9, achievements: mocks.achievements },
    xpProgress: 50, isLoading: mocks.gamificationLoading, isError: false, error: mocks.canView ? null : createApiClientError(403, { errorCode: 'PAY_GATE' }, 'Pro'), refetch: vi.fn(),
  }),
  useStreakFreeze: () => mocks.freeze,
  useRepairStreak: () => ({ ...mocks.repair, mutate: mocks.repairMutate, reset: vi.fn() }),
}))

type Locale = 'en' | 'pt-BR'
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
}

let tree: ReactTestRenderer | null = null

async function renderIn(locale: Locale, screen?: 'streak' | 'achievements') {
  await testI18n.changeLanguage(locale)
  await renderer.act(() => { tree = renderer.create(<ProgressContent screen={screen} />) })
  return tree!
}

function hosts(root: ReactTestRenderer): ReactTestInstance[] {
  return root.root.findAll((node) => typeof node.type === 'string')
}

const byTestId = (root: ReactTestRenderer, testID: string) => hosts(root).filter((node) => node.props.testID === testID)
const mascots = (root: ReactTestRenderer) => byTestId(root, 'orbit-mascot').filter((node) => node.props['data-orbit-face'] === 'rig')
const texts = (root: ReactTestRenderer) => hosts(root).filter((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children))
const lineOf = (root: ReactTestRenderer) => renderedText(byTestId(root, mocks.reducedMotion ? 'progress-orbit-line-still' : 'progress-orbit-line')[0]?.props.children ?? null)

function pressable(root: ReactTestRenderer, name: string | RegExp) {
  const matches = (value: unknown) => typeof value === 'string' && (typeof name === 'string' ? value === name : name.test(value))
  const nameOf = (node: ReactTestInstance) => node.props.accessibilityLabel ?? node.findAll((child) => String(child.type) === 'Text').map((child) => renderedText(child.props.children)).join(' ')
  const found = hosts(root).find((node) => typeof node.props.onPress === 'function' && matches(nameOf(node)))
  if (!found) throw new Error(`No pressable named ${String(name)}`)
  return found
}

async function press(node: ReactTestInstance) {
  await renderer.act(() => { (node.props.onPress as () => void)() })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(progressStreakNow))
  mocks.flag = true
  mocks.reducedMotion = false
  reanimatedTestState.reducedMotion = false
  mocks.canView = true
  mocks.gamificationLoading = false
  mocks.retrospective = readyWindow()
  mocks.repair = { isPending: false, isError: false, error: null }
  mocks.achievements = []
  for (const mock of [mocks.repairMutate, mocks.captureCompleted, mocks.captureEvent, mocks.refetch, mocks.push]) mock.mockReset()
  setStreak('ordinary')
  useUIStore.setState({ progressFiguresSeen: null })
  useUIPreferencesReadiness.setState({ ready: true })
})
afterEach(async () => {
  vi.useRealTimers()
  if (tree) await renderer.act(() => { tree!.unmount() })
  tree = null
  await testI18n.changeLanguage('en')
})

describe('Progresso root with orbit_guided_flows on (Android)', () => {
  it.each(['en', 'pt-BR'] as const)('draws one live Orbit at 96 above the line, then the question headings, in %s', async (locale) => {
    const root = await renderIn(locale)
    expect(mascots(root)).toHaveLength(1)
    expect(mascots(root)[0]!.props.width).toBe(96)
    expect(mascots(root)[0]!.props['data-orbit-state']).toBe('parado')
    expect(lineOf(root)).toBe(locale === 'en' ? 'You showed up on 12 of the last 30 days.' : 'Você apareceu em 12 dos últimos 30 dias.')
    expect(texts(root)).toEqual(expect.arrayContaining([catalogs[locale].progressScreen.sections.windowQuestion, catalogs[locale].progressScreen.sectionsQuestion]))
  })

  it('keeps every current control and opens each row route', async () => {
    const root = await renderIn('en')
    expect(hosts(root).filter((node) => node.props.accessibilityRole === 'radio').length).toBe(3)
    expect(root.root.findAll((node) => node.props.label === en.progressScreen.window.completionRate && node.props.value === '75%')).not.toHaveLength(0)
    expect(root.root.findAll((node) => String(node.type) === 'ShareEntry')).toHaveLength(1)
    await press(pressable(root, /Read/))
    expect(mocks.push).toHaveBeenCalledWith({ pathname: '/habits/[id]', params: { id: 'habit-1' } })
    for (const [label, route] of [['Streak', '/progress/streak'], ['Goals', '/progress/goals'], ['Achievements', '/progress/achievements']] as const) {
      await press(pressable(root, new RegExp(label)))
      expect(mocks.push).toHaveBeenLastCalledWith(route)
    }
    expect(byTestId(root, 'progress-streak-figure')).toHaveLength(0)
    expect(root.root.findAll((node) => String(node.type) === 'RootNotificationHeader')).toHaveLength(1)
  })

  it('draws Orbit at 128 at 1024 and above', async () => {
    __setWindowDimensions({ width: 1024, height: 900, scale: 1, fontScale: 1 })
    try {
      const root = await renderIn('en')
      expect(mascots(root)[0]!.props.width).toBe(128)
    } finally { __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 }) }
  })

  it('shows the skeleton while loading, with Orbit in Parado, no line and no spinner', async () => {
    mocks.retrospective = { isLoading: true, isError: false, error: null }
    const root = await renderIn('en')
    expect(mascots(root)[0]!.props['data-orbit-state']).toBe('parado')
    expect(byTestId(root, 'progress-orbit-line')).toHaveLength(0)
    expect(hosts(root).some((node) => node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === en.progressScreen.loading)).toBe(true)
    expect(root.root.findAll((node) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)
  })

  it('shows the error with its retry icon and Orbit in Parado', async () => {
    mocks.retrospective = { isLoading: false, isError: true, error: createApiClientError(500, { errorCode: 'INTERNAL_SERVER_ERROR' }, 'Server') }
    const root = await renderIn('en')
    expect(texts(root)).toContain(en.progressScreen.error)
    await press(pressable(root, en.progressScreen.retry))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(mascots(root)[0]!.props['data-orbit-state']).toBe('parado')
  })

  it.each(['en', 'pt-BR'] as const)('states the empty window as the line with its one action, in %s', async (locale) => {
    mocks.retrospective = { isLoading: false, isError: true, error: createApiClientError(400, { errorCode: 'NO_HABITS_FOR_PERIOD' }, 'Empty') }
    const root = await renderIn(locale)
    expect(lineOf(root)).toBe(catalogs[locale].progressScreen.orbit.empty)
    await press(pressable(root, catalogs[locale].progressScreen.window.emptyAction))
    expect(mocks.push).toHaveBeenCalledWith('/')
    expect(mascots(root)).toHaveLength(1)
  })

  it('shows the lock card with its upgrade route, Orbit in Parado and no line', async () => {
    mocks.retrospective = { isLoading: false, isError: true, error: createApiClientError(403, { errorCode: 'PAY_GATE' }, 'Pro') }
    const root = await renderIn('en')
    expect(byTestId(root, 'progress-locked-card')).toHaveLength(1)
    await press(pressable(root, en.progressScreen.window.lockedAction))
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/upgrade' }))
    expect(byTestId(root, 'progress-orbit-line')).toHaveLength(0)
    expect(hosts(root).some((node) => node.props['data-orbit-state'] === 'feliz')).toBe(false)
  })

  it('renders the current form with the flag off', async () => {
    mocks.flag = false
    const root = await renderIn('en')
    expect(mascots(root)).toHaveLength(0)
    expect(texts(root)).toContain(en.progressScreen.sections.window)
  })
})

describe('Progresso root bar selection (Android)', () => {
  const bars = (root: ReactTestRenderer) => hosts(root).filter((node) => node.props.accessibilityRole === 'radio')

  it('changes the line to the pressed day and back on a second press, with no request', async () => {
    const root = await renderIn('en')
    await press(bars(root)[0]!)
    expect(lineOf(root)).toBe('Tuesday, September 8: 1 of 2.')
    expect(renderedText(byTestId(root, 'bar-chart-readout')[0]!.props.children)).toMatch(/Tue.*Sep.*8/)
    await press(bars(root)[1]!)
    expect(lineOf(root)).toBe('Wednesday, September 9: 2 of 2.')
    await press(bars(root)[1]!)
    expect(lineOf(root)).toBe('You showed up on 12 of the last 30 days.')
    expect(mocks.refetch).not.toHaveBeenCalled()
  })

  it('returns the default line on a touch outside the chart', async () => {
    const root = await renderIn('pt-BR')
    await press(bars(root)[1]!)
    expect(lineOf(root)).toBe('Quarta-feira, 9 de setembro: 2 de 2.')
    await renderer.act(() => { (byTestId(root, 'progress-overview')[0]!.props.onTouchStart as () => void)() })
    expect(lineOf(root)).toBe('Você apareceu em 12 dos últimos 30 dias.')
  })

  it('keeps the line, the readout and the eyes still under reduced motion', async () => {
    mocks.reducedMotion = true
    reanimatedTestState.reducedMotion = true
    const root = await renderIn('en')
    await press(bars(root)[0]!)
    expect(lineOf(root)).toBe('Tuesday, September 8: 1 of 2.')
    expect(byTestId(root, 'bar-chart-readout')[0]!.props.layout).toBeUndefined()
    const eyes = mascots(root)[0]!.findAll((node) => String(node.type) === 'G' && typeof node.props.transform === 'string' && node.props.transform.startsWith('translate('))
    expect(eyes[0]!.props.transform).toMatch(/^translate\(0 0\)/)
  })
})

describe('Progresso root figures since the last visit (Android)', () => {
  it('rolls nothing on a first visit and keeps the values it showed', async () => {
    const root = await renderIn('en')
    expect(byTestId(root, 'stat-tile-value-roll')).toHaveLength(0)
    expect(useUIStore.getState().progressFiguresSeen).toEqual({ completionRate: 75, activeDays: 12, bestWeekday: 'thursday' })
  })

  it('rolls once only the figure that changed', async () => {
    useUIStore.setState({ progressFiguresSeen: { completionRate: 75, activeDays: 11, bestWeekday: 'thursday' } })
    const root = await renderIn('en')
    const rolling = byTestId(root, 'stat-tile-value-roll')
    expect(rolling).toHaveLength(1)
    expect(rolling[0]!.findAll((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children)).join(' ')).toContain('12')
  })

  it('keeps a changed figure still under reduced motion', async () => {
    mocks.reducedMotion = true
    useUIStore.setState({ progressFiguresSeen: { completionRate: 70, activeDays: 12, bestWeekday: 'thursday' } })
    const root = await renderIn('en')
    expect(byTestId(root, 'stat-tile-value-roll')).toHaveLength(0)
    expect(byTestId(root, 'stat-tile-value-still')).toHaveLength(1)
  })
})

describe('Sequência with orbit_guided_flows on (Android)', () => {
  it.each(['en', 'pt-BR'] as const)('states the streak and the next freeze beside Orbit at 48, in %s', async (locale) => {
    const root = await renderIn(locale, 'streak')
    expect(mascots(root)).toHaveLength(1)
    expect(mascots(root)[0]!.props.width).toBe(48)
    expect(renderedText(byTestId(root, 'streak-orbit-line')[0]!.props.children)).toBe(locale === 'en' ? '4 days in a row. 3 more days for the next freeze.' : '4 dias seguidos. Faltam 3 dias para o próximo congelamento.')
  })

  it('keeps the Freezes row and the freeze details, frozen today included', async () => {
    setStreak('frozen today')
    const root = await renderIn('en', 'streak')
    await press(pressable(root, /Freezes/))
    expect(texts(root).join(' ')).toContain(en.progressScreen.streak.banked)
  })

  it('says the gap sentence in Parado and shows the repair action on the screen', async () => {
    setStreak('repair available')
    const root = await renderIn('en', 'streak')
    expect(renderedText(byTestId(root, 'streak-orbit-line')[0]!.props.children)).toBe('One day with nothing logged. The habits are as they were.')
    expect(mascots(root)[0]!.props['data-orbit-state']).toBe('parado')
    expect(byTestId(root, 'streak-repair')).toHaveLength(1)
    pressable(root, /Repair/)
  })

  it.each([
    ['empty repair bank', en.progressScreen.streak.repairEmpty],
    ['partial repair bank', 'It needs 2 freezes, but only 1 is banked'],
    ['capped repair bank', 'cannot be repaired'],
  ])('keeps the %s case and offers no repair', async (name, copy) => {
    setStreak(name)
    const root = await renderIn('en', 'streak')
    expect(texts(root).join(' ')).toContain(copy)
    expect(() => pressable(root, /^Repair/)).toThrow()
  })

  it('keeps the lock card with no Feliz state and no line', async () => {
    mocks.canView = false
    const root = await renderIn('en', 'streak')
    expect(byTestId(root, 'progress-locked-card')).toHaveLength(1)
    expect(byTestId(root, 'streak-orbit-line')).toHaveLength(0)
    expect(hosts(root).some((node) => node.props['data-orbit-state'] === 'feliz')).toBe(false)
  })
})

describe('Progresso sub-screens with orbit_guided_flows on (Android)', () => {
  it('shows the skeleton strip while the streak history loads, with no line and no spinner', async () => {
    mocks.freeze = { ...deriveStreakFreezeState(null, null, '2026-09-10'), streakInfo: null, streakQuery: { isError: false, refetch: vi.fn() } }
    const root = await renderIn('en', 'streak')
    expect(byTestId(root, 'skeleton-unit-fill').length).toBeGreaterThan(0)
    expect(byTestId(root, 'streak-orbit-line')).toHaveLength(0)
    expect(root.root.findAll((node) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)
  })

  it.each(['streak', 'achievements'] as const)('shows the skeleton while %s loads and no spinner', async (screenId) => {
    mocks.gamificationLoading = true
    const root = await renderIn('en', screenId)
    expect(hosts(root).some((node) => node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === en.progressScreen.loading)).toBe(true)
    expect(byTestId(root, 'settings-skeleton-row').length).toBeGreaterThan(0)
    expect(root.root.findAll((node) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)
  })
})

describe('Sequência repair flow (Android)', () => {
  async function openRepair(locale: Locale = 'en') {
    setStreak('partial repair bank', { streakFreezesAccumulated: 2, freezesAvailableToUse: 2 })
    const root = await renderIn(locale, 'streak')
    await press(pressable(root, locale === 'en' ? /^Repair/ : /^Reparar/))
    return root
  }

  it.each(['en', 'pt-BR'] as const)('asks one question that states what the repair does and what it costs, in %s', async (locale) => {
    const root = await openRepair(locale)
    expect(byTestId(root, 'streak-repair-flow')).toHaveLength(1)
    expect(texts(root)).toContain(locale === 'en' ? 'Save your streak with 2 freezes?' : 'Salvar a sequência com 2 congelamentos?')
    pressable(root, catalogs[locale].progressScreen.streak.repairFlow.repair)
    pressable(root, catalogs[locale].progressScreen.streak.repairFlow.notNow)
    expect(mocks.captureEvent).toHaveBeenCalledWith({ name: 'guided_flow_step_viewed', properties: { flow: 'streak_repair', step: 'repair', step_count: 1 } })
  })

  it('sends the same request as the confirm and closes with the result dialog and the server count', async () => {
    const root = await openRepair()
    await press(pressable(root, en.progressScreen.streak.repairFlow.repair))
    expect(mocks.repairMutate).toHaveBeenCalledWith(['2026-09-08', '2026-09-09'], expect.anything())
    await renderer.act(() => { (mocks.repairMutate.mock.calls[0]![1] as { onSuccess: (info: { currentStreak: number }) => void }).onSuccess({ currentStreak: 7 }) })
    const dialog = byTestId(root, 'result-dialog')[0]!
    expect(dialog.props.accessibilityLabel).toBe(en.result.title)
    expect(dialog.props.accessibilityHint).toBe('Your streak is back to 7 days.')
    expect(dialog.findAll((node) => node.props['data-orbit-state'] === 'feliz').length).toBeGreaterThan(0)
    expect(mocks.captureCompleted).toHaveBeenCalledWith('streak_repair', 1, false)
    expect(byTestId(root, 'streak-repair-flow')).toHaveLength(0)
  })

  it('closes on Not now and on Android back with no request', async () => {
    const root = await openRepair()
    await press(pressable(root, en.progressScreen.streak.repairFlow.notNow))
    expect(byTestId(root, 'streak-repair-flow')).toHaveLength(0)
    await press(pressable(root, /^Repair/))
    await renderer.act(() => { (root.root.findAll((node) => String(node.type) === 'Modal')[0]!.props.onRequestClose as () => void)() })
    expect(byTestId(root, 'streak-repair-flow')).toHaveLength(0)
    expect(mocks.repairMutate).not.toHaveBeenCalled()
  })

  it.each([
    [500, en.progressScreen.streak.repairError],
    [429, en.progressScreen.streak.repairRateLimited],
  ])('keeps the flow open with the %s message and opens no dialog', async (status, message) => {
    const root = await openRepair()
    mocks.repair = { isPending: false, isError: true, error: createApiClientError(status, { errorCode: 'X' }, 'Error') }
    await renderer.act(() => { root.update(<ProgressContent screen="streak" />) })
    const flow = byTestId(root, 'streak-repair-flow')[0]!
    expect(flow.findAll((node) => node.props.accessibilityRole === 'alert').map((node) => renderedText(node.props.children))).toContain(message)
    expect(byTestId(root, 'result-dialog')).toHaveLength(0)
  })

  it('marks the chosen answer while the request runs and draws no spinner', async () => {
    const root = await openRepair()
    mocks.repair = { isPending: true, isError: false, error: null }
    await renderer.act(() => { root.update(<ProgressContent screen="streak" />) })
    const option = pressable(root, en.progressScreen.streak.repairFlow.repair)
    expect(option.props.accessibilityState).toMatchObject({ selected: true })
    await press(option)
    expect(mocks.repairMutate).not.toHaveBeenCalled()
    expect(root.root.findAll((node) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)
  })

  it('opens the flow with no animation under reduced motion', async () => {
    mocks.reducedMotion = true
    const root = await openRepair()
    expect(root.root.findAll((node) => String(node.type) === 'Modal')[0]!.props.animationType).toBe('none')
  })
})

describe('Conquistas with orbit_guided_flows on (Android)', () => {
  it('keeps the level row and the tiles, and a tile has no press action', async () => {
    mocks.achievements = [createMockAchievement({ id: 'first_habit', category: 'GettingStarted', isEarned: true })]
    const root = await renderIn('en', 'achievements')
    const tile = byTestId(root, 'achievement-tile-first_habit')[0]!
    expect(tile.props.onPress).toBeUndefined()
    expect(texts(root).join(' ')).toContain('Level 2')
  })

  it('keeps the empty state with its action and the lock card with no Feliz state', async () => {
    const root = await renderIn('en', 'achievements')
    await press(pressable(root, en.progressScreen.achievements.emptyAction))
    expect(mocks.push).toHaveBeenCalledWith('/')
    await renderer.act(() => { root.unmount() })
    tree = null
    mocks.canView = false
    const locked = await renderIn('en', 'achievements')
    expect(byTestId(locked, 'progress-locked-card')).toHaveLength(1)
    expect(hosts(locked).some((node) => node.props['data-orbit-state'] === 'feliz')).toBe(false)
  })
})
