import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { StyleSheet, Text } from 'react-native'
import { TodayAstra } from '@/components/today/today-astra'
import { Shell412 } from '@/components/shell/shell-412'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  notifications: NotificationItem[]
  markRead: ReturnType<typeof vi.fn>
  navigateProgress: ReturnType<typeof vi.fn>
  profile: { id: string; timeZone: string; lastCompletionDate?: string | null; aiMessagesUsed?: number; aiMessagesLimit?: number }
  isOnline: boolean
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  notifications: [],
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
  useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: mocks.notifications }),
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({
    bg: '#111111',
    bgHover: '#333333',
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

async function renderTodayAstra(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <Shell412 tabBar={React.createElement('TabBar')}>
        <TodayAstra isTodaySelected suppressed={false} />
      </Shell412>,
    )
    await Promise.resolve()
  })
  return tree
}

function hasText(tree: ReactTestRenderer, text: string): boolean {
  return tree.root.findAll((node) =>
    Array.isArray(node.props.children) && node.props.children.includes(text),
  ).length > 0
}

describe('mobile Today Astra', () => {
  beforeEach(() => {
    mocks.notifications = []
    mocks.markRead.mockReset()
    mocks.navigateProgress.mockReset()
    mocks.profile = { id: 'profile', timeZone: 'UTC' }
    mocks.isOnline = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    useUIStore.setState({ astraConversationOpen: false })
  })

  it.each([
    ['three-day completion', '2026-08-26', 'todayAstra.returningElapsed:3'],
    ['four-day completion', '2026-08-25', 'todayAstra.returningElapsed:4'],
    ['window boundary', '2026-07-30', 'todayAstra.returningElapsed:30'],
    ['gap beyond the window', '2026-07-29', 'todayAstra.returningBounded'],
  ])('shows the profile interval for %s', async (_scenario, lastCompletionDate, expected) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    const tree = await renderTodayAstra()

    expect(hasText(tree, expected)).toBe(true)
  })

  it.each([null, undefined])('shows no interval for %s completion', async (lastCompletionDate) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    const tree = await renderTodayAstra()

    expect(hasText(tree, 'todayAstra.returningBounded')).toBe(false)
    expect(hasText(tree, 'todayAstra.returningElapsed:3')).toBe(false)
  })

  it('opens Progress from the returning line without marking a notification read', async () => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26' }

    const tree = await renderTodayAstra()
    const action = tree.root.findAll((node) => node.props.accessibilityRole === 'link')[0]
    if (!action) throw new Error('Returning action did not render')
    expect(action.props.hitSlop).toEqual({ top: 12, right: 12, bottom: 12, left: 12 })
    expect(StyleSheet.flatten(action.props.style) as Record<string, unknown>).toMatchObject({ minWidth: 44, minHeight: 44 })
    expect(tree.root.findAll((node) => node.type === Text &&
      node.findAll((child) => child.props.accessibilityRole === 'link').length > 0,
    ).length).toBeGreaterThan(0)
    await TestRenderer.act(async () => {
      ;(action.props.onPress as () => void)()
      await Promise.resolve()
    })

    expect(mocks.navigateProgress).toHaveBeenCalledWith('/progress')
    expect(mocks.markRead).not.toHaveBeenCalled()
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it.each(['offline', 'quota exhausted'])('keeps Progress available when %s', async (state) => {
    mocks.profile = {
      id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26',
      aiMessagesUsed: state === 'quota exhausted' ? 10 : 0, aiMessagesLimit: 10,
    }
    mocks.isOnline = state !== 'offline'

    const tree = await renderTodayAstra()

    expect(hasText(tree, 'todayAstra.returningElapsed:3')).toBe(true)
    expect(tree.root.findAll((node) =>
      node.props.accessibilityRole === 'link' &&
      node.findAll((child) => child.props.children === 'todayAstra.viewProgress').length > 0,
    ).length).toBeGreaterThan(0)
  })

  it('renders a proactive check-in and opens its conversation', async () => {
    mocks.notifications = [{
      id: 'check-in',
      title: 'Astra',
      body: 'Check in',
      url: '/chat',
      habitId: null,
      isRead: false,
      createdAtUtc: '2026-08-29T10:00:00Z',
    }]

    const tree = await renderTodayAstra()

    expect(hasText(tree, 'Check in')).toBe(true)
    const action = tree.root.findAll((node) =>
      node.props.accessibilityRole === 'link' &&
      node.findAll((child) => child.props.children === 'todayAstra.openConversation').length > 0,
    )[0]
    if (!action) throw new Error('Proactive conversation action did not render')
    const label = action.findAll((node) => node.props.children === 'todayAstra.openConversation')[0]
    expect(StyleSheet.flatten(label?.props.style) as Record<string, unknown>).toMatchObject({
      textDecorationLine: 'underline',
    })
    expect((StyleSheet.flatten(action.props.style) as Record<string, unknown>).backgroundColor).toBeUndefined()
    const onPressIn = action.props.onPressIn
    if (typeof onPressIn !== 'function') throw new Error('Proactive action cannot receive press feedback')
    await TestRenderer.act(async () => {
      onPressIn()
      await Promise.resolve()
    })
    const pressedAction = tree.root.findAll((node) =>
      node.props.accessibilityRole === 'link' &&
      node.findAll((child) => child.props.children === 'todayAstra.openConversation').length > 0,
    )[0]
    if (!pressedAction) throw new Error('Pressed proactive action did not render')
    expect((StyleSheet.flatten(pressedAction.props.style) as Record<string, unknown>)).toMatchObject({
      backgroundColor: '#333333',
    })
    const pressedLabel = pressedAction.findAll((node) => node.props.children === 'todayAstra.openConversation')[0]
    expect((StyleSheet.flatten(pressedLabel?.props.style) as Record<string, unknown>)).toMatchObject({ color: '#ffffff' })
    const onPressOut = pressedAction.props.onPressOut
    if (typeof onPressOut !== 'function') throw new Error('Proactive action cannot release press feedback')
    await TestRenderer.act(async () => {
      onPressOut()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(action.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.markRead).toHaveBeenCalledWith('check-in')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('shows returning Progress when a proactive check-in is unavailable offline', async () => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26' }
    mocks.notifications = [{
      id: 'check-in', title: 'Astra', body: 'Check in', url: '/chat', habitId: null,
      isRead: false, createdAtUtc: '2026-08-29T10:00:00Z',
    }]
    mocks.isOnline = false

    const tree = await renderTodayAstra()

    expect(hasText(tree, 'todayAstra.returningElapsed:3')).toBe(true)
    expect(hasText(tree, 'Check in')).toBe(false)
  })

  it('does not add retired inline Astra content to a 50 habit list', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <TodayAstra isTodaySelected suppressed={false} />
          {Array.from({ length: 50 }, (_, index) => React.createElement('HabitRow', { key: index }))}
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => String(node.type) === 'HabitRow')).toHaveLength(50)
    expect(hasText(tree, 'todayAstra.openConversation')).toBe(false)
  })
})
