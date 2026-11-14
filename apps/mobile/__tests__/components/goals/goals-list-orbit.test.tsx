import React from 'react'
import * as ReactNative from 'react-native'
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { Goal } from '@orbit/shared/types/goal'
import { GOAL_SEEN_PROGRESS_STORAGE_KEY } from '@orbit/shared/utils/goal-seen-progress'
import { accountStorageKey } from '@/lib/account-storage-key'
import GoalsPage from '@/app/progress/goals'

const mocks = vi.hoisted(() => ({
  guided: true,
  reducedMotion: false,
  storage: new Map<string, string>(),
  storageRefused: false,
  goals: { data: undefined as { allGoals: Goal[] } | undefined, isError: false, isLoading: false, refetch: vi.fn() },
  reorder: { mutate: vi.fn(), isPending: false, isError: false },
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => (mocks.storageRefused ? Promise.reject(new Error('denied')) : Promise.resolve(mocks.storage.get(key) ?? null)),
    setItem: (key: string, value: string) => { if (mocks.storageRefused) return Promise.reject(new Error('denied')); mocks.storage.set(key, value); return Promise.resolve() },
  },
}))
vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, i18n: { language: 'en' } }),
}))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('expo-router', () => ({ usePathname: () => '/progress/goals', useRouter: () => ({ push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() }) }))
vi.mock('react-native-draggable-flatlist', () => ({
  NestableScrollContainer: React.forwardRef((props: React.ComponentProps<typeof ReactNative.ScrollView>, ref: React.ForwardedRef<ReactNative.ScrollView>) => <ReactNative.ScrollView ref={ref} {...props} />),
  NestableDraggableFlatList: ({ data, renderItem }: { data: Goal[]; renderItem: (params: { item: Goal; getIndex: () => number; drag: () => void; isActive: boolean }) => React.ReactNode }) =>
    <>{data.map((item, index) => <React.Fragment key={item.id}>{renderItem({ item, getIndex: () => index, drag: vi.fn(), isActive: false })}</React.Fragment>)}</>,
}))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: vi.fn(), useGoals: () => mocks.goals, useReorderGoals: () => mocks.reorder }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: (props: { goalId: string }) => React.createElement('GoalDetail', props) }))
vi.mock('@/components/goals/create-goal-sheet', () => ({ CreateGoalSheet: (props: { onOpenGoal?: (goalId: string) => void; onClose: () => void }) => React.createElement('CreateGoal', props) }))


const read = createMockGoal({ id: 'read', title: 'Read 12 books', currentValue: 6, targetValue: 12, unit: 'books', progressPercentage: 50 })
const run = createMockGoal({ id: 'run', title: 'Run 100 km', currentValue: 25, targetValue: 100, unit: 'km', progressPercentage: 25 })
const seenKey = () => accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY)

/** The local test renderer types expose `findAll` only, and props as unknown. */
const byProp = (root: ReactTestInstance, name: string, value: unknown) => root.findAll((node) => node.props[name] === value)[0]!
const allByProp = (root: ReactTestInstance, name: string, value: unknown) => root.findAll((node) => node.props[name] === value)
const call = (node: ReactTestInstance, prop: string, ...values: unknown[]) => (node.props[prop] as (...args: unknown[]) => unknown)(...values)
const isType = (node: ReactTestInstance, name: string) => String(node.type) === name

let tree: ReactTestRenderer
async function renderGoals() {
  await act(async () => { tree = TestRenderer.create(<GoalsPage />); await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}
const ring = (goalId: string): ReactTestInstance => byProp(tree.root, 'testID', `goal-ring-${goalId}`)
const ringValue = (goalId: string) => (byProp(ring(goalId), 'accessibilityRole', 'progressbar').props.accessibilityValue as { now: number }).now
async function nextFrames() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
}

describe('goals list on the Orbit logic', () => {
  beforeEach(() => {
    mocks.guided = true
    mocks.reducedMotion = false
    mocks.storage.clear()
    mocks.storageRefused = false
    mocks.goals = { data: { allGoals: [read, run] }, isError: false, isLoading: false, refetch: vi.fn() }
    mocks.reorder = { mutate: vi.fn(), isPending: false, isError: false }
  })
  afterEach(async () => { await act(() => tree.unmount()) })

  it('shows Orbit at rest, the title and one action in the empty state', async () => {
    mocks.goals = { data: { allGoals: [] }, isError: false, isLoading: false, refetch: vi.fn() }
    await renderGoals()
    const empty = byProp(tree.root, 'testID', 'empty-state')
    expect(byProp(empty, 'testID', 'orbit-mascot').props['data-orbit-state']).toBe('parado')
    expect(byProp(empty, 'testID', 'orbit-mascot').props.width).toBe(96)
    expect(empty.findAll((node) => node.props.children === 'progressScreen.goals.empty' && typeof node.type === 'string')).not.toHaveLength(0)
    const actions = empty.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.type === 'string')
    expect(actions).toHaveLength(1)
    await act(() => { call(actions[0]!, 'onPress') })
    expect(tree.root.findAll((node) => isType(node, 'CreateGoal'))).toHaveLength(1)
  })

  it('sweeps the ring once from the value of the last visit and stores what it shows now', async () => {
    mocks.storage.set(seenKey(), JSON.stringify({ read: 25, run: 25 }))
    await renderGoals()
    expect(ringValue('read')).toBe(25)
    expect(ring('read').props['data-ring-sweep']).toBe('sweeping')
    expect(ring('run').props['data-ring-sweep'], 'a goal with no change is still').toBe('rest')
    expect(byProp(ring('read'), 'sweepDuration', 'slow'), 'the sweep runs on motionDurations.slow').toBeDefined()
    expect(byProp(ring('run'), 'sweepDuration', 'base')).toBeDefined()
    await nextFrames()
    expect(ringValue('read')).toBe(50)
    expect(ring('read').props['data-ring-sweep']).toBe('rest')
    expect(JSON.parse(mocks.storage.get(seenKey())!)).toEqual({ read: 50, run: 25 })
  })

  it('sweeps a ring only once in a visit, so a filter change never replays it', async () => {
    mocks.storage.set(seenKey(), JSON.stringify({ read: 25, run: 25 }))
    await renderGoals()
    await nextFrames()
    const menu = tree.root.findAll((node) => Array.isArray(node.props.items) && typeof node.props.onSelect === 'function')[0]!
    await act(async () => { call(menu, 'onSelect', 'active'); await Promise.resolve() })
    expect(ringValue('read')).toBe(50)
    expect(ring('read').props['data-ring-sweep'], 'a remounted card stays at rest').toBe('rest')
  })

  it('reads refused storage as no last visit, shows the list and draws every ring at rest', async () => {
    mocks.storageRefused = true
    await renderGoals()
    await act(async () => { await Promise.resolve() })
    expect(ringValue('read')).toBe(50)
    expect(ring('read').props['data-ring-sweep']).toBe('rest')
  })

  it('opens the created goal from the filled action of the result dialog', async () => {
    await renderGoals()
    await act(() => { call(tree.root.findAll((node) => node.props.accessibilityLabel === 'goals.create' && typeof node.props.onPress === 'function')[0]!, 'onPress') })
    const sheet = tree.root.findAll((node) => isType(node, 'CreateGoal'))[0]!
    await act(() => { call(sheet, 'onClose'); call(sheet, 'onOpenGoal', 'read') })
    expect(tree.root.findAll((node) => isType(node, 'CreateGoal'))).toHaveLength(0)
    expect(tree.root.findAll((node) => isType(node, 'GoalDetail'))[0]!.props.goalId).toBe('read')
  })

  it('does not sweep on a first visit', async () => {
    await renderGoals()
    expect(ringValue('read')).toBe(50)
    expect(ring('read').props['data-ring-sweep']).toBe('rest')
  })

  it('draws the final ring at once under reduced motion and still records the visit', async () => {
    mocks.reducedMotion = true
    mocks.storage.set(seenKey(), JSON.stringify({ read: 25 }))
    await renderGoals()
    expect(ringValue('read')).toBe(50)
    expect(ring('read').props['data-ring-sweep']).toBe('rest')
    expect(JSON.parse(mocks.storage.get(seenKey())!)).toEqual({ read: 50, run: 25 })
  })

  it('reads the last visit when the flag arrives after the first render, before it records the new values', async () => {
    mocks.guided = false
    mocks.storage.set(seenKey(), JSON.stringify({ read: 25, run: 25 }))
    await renderGoals()
    mocks.guided = true
    await act(async () => { tree.update(<GoalsPage />); await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(ring('read').props['data-ring-sweep']).toBe('sweeping')
    await nextFrames()
    expect(ringValue('read')).toBe(50)
    expect(JSON.parse(mocks.storage.get(seenKey())!)).toEqual({ read: 50, run: 25 })
  })

  it('keeps the current list with the flag off: no sweep and nothing stored', async () => {
    mocks.guided = false
    mocks.storage.set(seenKey(), JSON.stringify({ read: 25 }))
    await renderGoals()
    expect(ringValue('read')).toBe(50)
    expect(JSON.parse(mocks.storage.get(seenKey())!)).toEqual({ read: 25 })
  })

  it('keeps the move actions, the create action and the open press', async () => {
    await renderGoals()
    const card = byProp(tree.root, 'testID', 'goal-card-read')
    await act(() => { call(card, 'onAccessibilityAction', { nativeEvent: { actionName: 'increment' } }) })
    expect(mocks.reorder.mutate).toHaveBeenCalledWith([{ id: 'run', position: 0 }, { id: 'read', position: 1 }], expect.anything())
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'goals.create' && typeof node.props.onPress === 'function')).not.toHaveLength(0)
    await act(() => { call(byProp(tree.root, 'testID', 'goal-card-run'), 'onPress') })
    expect(tree.root.findAll((node) => isType(node, 'GoalDetail'))[0]!.props.goalId).toBe('run')
  })

  it('shows the loading skeleton and the error with retry', async () => {
    mocks.goals = { data: undefined, isError: false, isLoading: true, refetch: vi.fn() }
    await renderGoals()
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === 'progressScreen.loading')).not.toHaveLength(0)
    await act(() => tree.unmount())
    const refetch = vi.fn()
    mocks.goals = { data: undefined, isError: true, isLoading: false, refetch }
    await renderGoals()
    await act(() => { call(tree.root.findAll((node) => node.props.accessibilityLabel === 'progressScreen.retry' && typeof node.props.onPress === 'function')[0]!, 'onPress') })
    expect(refetch).toHaveBeenCalled()
  })
})
