import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import TodayScreen from '@/app/(tabs)/index'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  habit: { id: 'habit-1', parentId: null, title: 'Walk' } as NormalizedHabit,
  habitListProps: null as Record<string, unknown> | null,
  routerPush: vi.fn(),
  lastCompletionDate: undefined as string | null | undefined,
  noHabits: false,
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    React.useEffect(callback, [callback])
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { days: number }) =>
    values ? `${key}:${values.days}` : key }),
}))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/utils')>(),
  getTodayBoundary: () => null,
  parseShowGeneralOnTodayPreference: () => false,
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', lastCompletionDate: mocks.lastCompletionDate } }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

function isSuppressed(tree: ReturnType<typeof TestRenderer.create>): boolean {
  const astra = tree.root.findAll((node) => String(node.type) === 'TodayAstraMock')[0]
  if (!astra) throw new Error('Today Astra did not render')
  return astra.props.suppressed === true
}

describe('mobile Today Astra owned surfaces', () => {
  beforeEach(() => {
    mocks.habitListProps = null
    mocks.routerPush.mockReset()
    mocks.lastCompletionDate = undefined
    mocks.noHabits = false
    useUIStore.setState({
      showCreateModal: false,
      isSelectMode: false,
      selectedHabitIds: new Set(),
    })
  })

  it.each([
    ['create', (props: Record<string, unknown>) => (props.onCreatePress as () => void)()],
    ['edit', (props: Record<string, unknown>) => (props.onEditHabit as (habit: NormalizedHabit) => void)(mocks.habit)],
  ])('stands down while the %s surface is open', async (_surface, openSurface) => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })
    expect(isSuppressed(tree)).toBe(false)

    await TestRenderer.act(async () => {
      openSurface(mocks.habitListProps ?? {})
      await Promise.resolve()
    })

    expect(isSuppressed(tree)).toBe(true)
  })

  it.each([
    ['2026-08-26', true],
    [null, false],
    [undefined, false],
  ])('shows returning guidance with zero habits only for a qualifying completion: %s', async (lastCompletionDate, visible) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    mocks.lastCompletionDate = lastCompletionDate
    mocks.noHabits = true

    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    const returning = tree.root.findAll((node) =>
      Array.isArray(node.props.children) && node.props.children.includes('todayAstra.returningElapsed:3'),
    )
    expect(returning.length > 0).toBe(visible)
    vi.useRealTimers()
  })

  it('routes detail into the habit flow instead of opening a Today surface', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<TodayScreen />)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      const openDetail = (mocks.habitListProps?.onDetailHabit as (habit: NormalizedHabit) => void)
      openDetail(mocks.habit)
      await Promise.resolve()
    })

    expect(mocks.routerPush).toHaveBeenCalledWith({
      pathname: '/habits/[id]',
      params: { id: 'habit-1', date: '2026-08-29', from: 'today' },
    })
    expect(isSuppressed(tree)).toBe(false)
  })
})
