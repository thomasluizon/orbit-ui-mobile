import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClientError } from '@orbit/shared/utils'
import { progressStreakNow, progressStreakStates } from '@orbit/shared/__tests__/progress-streak-fixtures'
import { deriveStreakFreezeState } from '@orbit/shared/utils/gamification-selectors'
import { ProgressContent } from '@/components/progress/progress-content'
import { Shell412 } from '@/components/shell/shell-412'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const state = vi.hoisted(() => {
  const retrospectiveError: unknown = null
  const freeze: Record<string, unknown> = {}
  return { retrospectiveError, freeze, streakError: false, repairMutate: vi.fn() }
})

vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: (await import('react-native')).View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}))
vi.mock('expo-router', () => ({ usePathname: () => '/progress', useRouter: () => ({ push: vi.fn(), dismissTo: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('@/components/navigation/root-notification-header', () => ({ RootNotificationHeader: () => null }))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ isLoading: false, isError: true, error: state.retrospectiveError, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', canViewGamification: true }, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ profile: { level: 1, totalXp: 0, xpForNextLevel: 100, achievements: [] }, xpProgress: 0, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useStreakFreeze: () => ({ ...state.freeze, streakQuery: { isError: state.streakError, refetch: vi.fn() } }),
  useRepairStreak: () => ({ isPending: false, isError: false, error: null, mutate: state.repairMutate, reset: vi.fn() }),
}))

const HEIGHT = 915
const FLOW_HEADER_HEIGHT = 56
const WIDTHS = [320, 360, 384, 412] as const
let tree: GeometryTree

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(progressStreakNow))
  state.streakError = false
  const streak = progressStreakStates.find((entry) => entry.name === 'repair available')!.streak
  state.freeze = { ...deriveStreakFreezeState(streak, null, '2026-09-10'), streakInfo: streak }
  state.retrospectiveError = createApiClientError(400, { errorCode: 'NO_HABITS_FOR_PERIOD' }, 'Empty')
})
afterEach(async () => {
  vi.useRealTimers()
  await act(() => tree.unmount())
})

async function mount(width: number, screen?: 'streak') {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<Shell412 safeAreaTop={false} notice={<></>} tabBar={<View testID="tab-bar" style={{ height: 80 }} />}><ProgressContent screen={screen} /></Shell412>) as GeometryTree })
}

function centreX(box: { left: number; width: number }) {
  return box.left + box.width / 2
}

describe('Progresso centred blocks on Android', () => {
  it.each(WIDTHS)('centres the empty window line under Orbit on the horizontal axis at %i px', async (width) => {
    await mount(width)
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
    const column = boxes.get('progress-orbit')!
    const line = boxes.get('progress-orbit-line')!
    expect(Math.abs(centreX(line) - centreX(column))).toBeLessThanOrEqual(1)
    expect(Math.abs(centreX(column) - width / 2)).toBeLessThanOrEqual(1)
  })

  it.each(WIDTHS)('centres the full-surface error of Sequência between the header and the tab bar at %i px', async (width) => {
    state.streakError = true
    await mount(width, 'streak')
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
    const group = boxes.get('progress-surface-error')!
    const region = boxes.get('shell-centred-region')!
    const free = { top: region.top, bottom: boxes.get('tab-bar')!.top }
    expect(Math.abs((group.top + group.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(centreX(group) - width / 2)).toBeLessThanOrEqual(1)
  })

  it.each(WIDTHS)('centres the repair question block below the flow header at %i px', async (width) => {
    await mount(width, 'streak')
    const repairWell = tree.root.findAll((node) => node.props.testID === 'streak-repair' && typeof node.type === 'string')[0]!
    const repair = repairWell.findAll((node) => typeof node.type === 'string' && typeof node.props.onPress === 'function')[0]!
    await act(() => { (repair.props.onPress as () => void)() })
    const modal = (tree.toJSON() as unknown as GeometryHost[] | GeometryHost)
    const hosts = Array.isArray(modal) ? modal : [modal]
    const flowHost = findHost(hosts, (host) => host.type === 'Modal')!
    const boxes = measureSafeArea(flowHost, (host) => host.props.testID, { width, height: HEIGHT })
    const block = boxes.get('question-flow-step-repair')!
    const flow = boxes.get('question-flow')!
    const free = { top: flow.top + FLOW_HEADER_HEIGHT, bottom: flow.bottom }
    expect(Math.abs(centreX(block) - centreX(flow))).toBeLessThanOrEqual(1)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })

  it.each(WIDTHS)('centres the result dialog of a repair at %i px', async (width) => {
    await mount(width, 'streak')
    const repairWell = tree.root.findAll((node) => node.props.testID === 'streak-repair' && typeof node.type === 'string')[0]!
    await act(() => { (repairWell.findAll((node) => typeof node.type === 'string' && typeof node.props.onPress === 'function')[0]!.props.onPress as () => void)() })
    const option = tree.root.findAll((node) => node.props.testID === 'option-card' && typeof node.type === 'string')[0]!
    await act(() => { (option.props.onPress as () => void)() })
    await act(() => { (state.repairMutate.mock.calls.at(-1)![1] as { onSuccess: (info: { currentStreak: number }) => void }).onSuccess({ currentStreak: 3 }) })
    const rendered = tree.toJSON() as unknown as GeometryHost[] | GeometryHost
    const dialogHost = findHost(Array.isArray(rendered) ? rendered : [rendered], (host) => host.type === 'Modal')!
    const boxes = measureSafeArea(dialogHost, (host) => host.props.testID, { width, height: HEIGHT })
    const panel = boxes.get('result-dialog')!
    expect(Math.abs(centreX(panel) - width / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs((panel.top + panel.bottom) / 2 - HEIGHT / 2)).toBeLessThanOrEqual(1)
  })
})

function findHost(hosts: GeometryHost[], match: (host: GeometryHost) => boolean): GeometryHost | undefined {
  for (const host of hosts) {
    if (match(host)) return host
    const found = findHost((host.children ?? []).filter((child): child is GeometryHost => typeof child !== 'string'), match)
    if (found) return found
  }
  return undefined
}
