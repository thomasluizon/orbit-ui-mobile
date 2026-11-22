import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import type { ProactiveItem } from '@orbit/shared/types'
import { StyleSheet, Text, View } from 'react-native'
import { TodayOrbit } from '@/components/today/today-orbit'
import { Shell412 } from '@/components/shell/shell-412'
import { useUIStore } from '@/stores/ui-store'

interface TodayOrbitMocks {
  item: ProactiveItem | null
  markRead: ReturnType<typeof vi.fn<(id: string) => void>>
  navigateProgress: ReturnType<typeof vi.fn<(id: string) => void>>
  profile: { id: string; timeZone: string; lastCompletionDate?: string | null; aiMessagesUsed?: number; aiMessagesLimit?: number }
  isOnline: boolean
}

const mocks = vi.hoisted((): TodayOrbitMocks => ({
  item: null,
  markRead: vi.fn(),
  navigateProgress: vi.fn(),
  profile: { id: 'profile', timeZone: 'UTC' },
  isOnline: true,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { days: number }) =>
    values ? `${key}:${values.days}` : key }),
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mocks.navigateProgress }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: true, aiSummaryEnabled: false, ...mocks.profile }, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-proactive-item', () => ({
  useProactiveItem: () => ({ item: mocks.item, openItem: (item: ProactiveItem) => {
    mocks.markRead(item.id)
    useUIStore.getState().setOrbitConversationOpen(true)
  } }),
}))
vi.mock('@/components/ui/orbit-mascot', () => ({ OrbitMascot: () => null }))
vi.mock('@/lib/theme', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/theme')>(),
  createTokensV2: () => ({
    bg: '#111111',
    bgHover: '#333333',
    bgWell: '#444444',
    bgHoverOpaque: '#333333',
    hairline: '#222222',
    fg1: '#ffffff',
    fg2: '#eeeeee',
    fg3: '#aaaaaa',
  }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer

async function renderTodayOrbit(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <Shell412 tabBar={React.createElement('TabBar')}>
        <TodayOrbit today={formatAPIDateInTimeZone(new Date(), mocks.profile.timeZone)} isTodaySelected suppressed={false} />
      </Shell412>,
    )
    await Promise.resolve()
  })
  return tree
}

function hasText(tree: ReactTestRenderer, text: string): boolean {
  return tree.root.findAll((node) =>
    node.props.children === text,
  ).length > 0
}

describe('mobile Today Orbit', () => {

  beforeEach(() => {
    mocks.item = null
    mocks.markRead.mockReset()
    mocks.navigateProgress.mockReset()
    mocks.profile = { id: 'profile', timeZone: 'UTC' }
    mocks.isOnline = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    useUIStore.setState({ orbitConversationOpen: false })
  })

  it.each([null, undefined])('shows no interval for %s completion', async (lastCompletionDate) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    const tree = await renderTodayOrbit()

    expect(hasText(tree, 'todayOrbit.returningBounded')).toBe(false)
    expect(hasText(tree, 'todayOrbit.returningElapsed:3')).toBe(false)
  })

  it('opens Progress from the returning line without marking a notification read', async () => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26' }

    const tree = await renderTodayOrbit()
    const action = tree.root.findAll((node) => node.props.accessibilityRole === 'link')[0]
    if (!action) throw new Error('Returning action did not render')
    await TestRenderer.act(async () => {
      ;(action.props.onPress as () => void)()
      await Promise.resolve()
    })

    expect(mocks.navigateProgress).toHaveBeenCalledWith('/progress')
    expect(mocks.markRead).not.toHaveBeenCalled()
    expect(useUIStore.getState().orbitConversationOpen).toBe(false)
  })

  it('renders a proactive check-in and opens its conversation', async () => {
    mocks.item = createMockProactiveItem({ text: 'Check in' })

    const tree = await renderTodayOrbit()

    const action = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Check in')[0]!
    expect(StyleSheet.flatten(action.props.style)).toMatchObject({ backgroundColor: '#444444' })
    await TestRenderer.act(() => { (action.props.onPressIn as () => void)() })
    const feedback = action.findAll((node) => node.type === View && node.props.pointerEvents === 'none')[0]!
    expect(feedback.props.accessible).toBe(false)
    expect(StyleSheet.flatten(feedback.props.style)).toMatchObject({ backgroundColor: '#333333', borderRadius: 12, position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 })
    await TestRenderer.act(() => { (action.props.onPressOut as () => void)() })
    expect(action.findAll((node) => node.type === View && node.props.pointerEvents === 'none')).toHaveLength(0)
    expect(StyleSheet.flatten(action.props.style)).toMatchObject({ backgroundColor: '#444444' })
    await TestRenderer.act(async () => {
      ;(action.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.markRead).toHaveBeenCalledWith(mocks.item.id)
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
  })

  it('does not add retired inline Orbit content to a 50 habit list', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <TodayOrbit today={formatAPIDateInTimeZone(new Date(), mocks.profile.timeZone)} isTodaySelected suppressed={false} />
          {Array.from({ length: 50 }, (_, index) => React.createElement('HabitRow', { key: index }))}
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => String(node.type) === 'HabitRow')).toHaveLength(50)
    expect(hasText(tree, 'todayOrbit.openConversation')).toBe(false)
  })
})
