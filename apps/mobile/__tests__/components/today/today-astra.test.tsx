import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { StyleSheet, Text, View } from 'react-native'
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

async function renderTodayAstra(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <Shell412 tabBar={React.createElement('TabBar')}>
        <TodayAstra today={formatAPIDateInTimeZone(new Date(), mocks.profile.timeZone)} isTodaySelected suppressed={false} />
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

describe('mobile Today Astra', () => {
  it.each([
    ['proactive', 'Check in', 'todayAstra.openConversation'],
    ['elapsed', 'todayAstra.returningElapsed:3', 'todayAstra.viewProgress'],
    ['bounded', 'todayAstra.returningBounded', 'todayAstra.viewProgress'],
  ])('makes the %s sentence the whole row target with a destination hint', async (variant, sentence, destination) => {
    mocks.profile.lastCompletionDate = variant === 'bounded' ? '2026-07-29' : '2026-08-26'
    if (variant === 'proactive') mocks.notifications = [createMockNotification({
      id: 'check-in', url: '/chat', body: sentence, createdAtUtc: '2026-08-29T10:00:00Z',
    })]
    const tree = await renderTodayAstra()
    const actions = tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.onPress === 'function')
    expect(actions).toHaveLength(1)
    const action = actions[0]!
    expect(action.props.accessibilityLabel).toBe(sentence)
    expect(action.props.accessibilityHint).toBe(destination)
    expect(action.props.accessibilityRole).toBe(variant === 'proactive' ? 'button' : 'link')
    expect(StyleSheet.flatten(action.props.style)).toMatchObject({ minHeight: 48, paddingLeft: 0, paddingRight: 16, borderRadius: 12 })
    expect(action.props.hitSlop).toBeUndefined()
    const prose = action.findAll((node) => node.type === Text)[0]!
    expect(prose.props.children).toBe(sentence)
    expect(prose.props.numberOfLines).toBe(2)
    expect(prose.props.ellipsizeMode).toBe('tail')
    expect(prose.findAll((node) => typeof node.props.onPress === 'function')).toHaveLength(0)
    await TestRenderer.act(() => { (action.props.onPress as () => void)() })
    if (variant === 'proactive') {
      expect(mocks.markRead).toHaveBeenCalledWith('check-in')
      expect(useUIStore.getState().astraConversationOpen).toBe(true)
      expect(mocks.navigateProgress).not.toHaveBeenCalled()
    } else {
      expect(mocks.navigateProgress).toHaveBeenCalledWith('/progress')
      expect(mocks.markRead).not.toHaveBeenCalled()
      expect(useUIStore.getState().astraConversationOpen).toBe(false)
    }
  })

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
      node.props.accessibilityHint === 'todayAstra.viewProgress',
    ).length).toBeGreaterThan(0)
  })

  it.each([
    ['23:59 yesterday locally', '2026-08-29T02:59:00Z', false, false],
    ['00:01 today locally', '2026-08-29T03:01:00Z', false, true],
    ['read today', '2026-08-29T03:01:00Z', true, false],
  ])('filters the proactive line using the profile timezone: %s', async (_scenario, createdAtUtc, isRead, visible) => {
    mocks.profile.timeZone = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-08-29T03:02:00Z'))
    mocks.notifications = [createMockNotification({ url: '/chat', body: 'Check in', createdAtUtc, isRead })]

    const tree = await renderTodayAstra()

    expect(tree.root.findAll((node) => node.props.children === 'Check in').length > 0).toBe(visible)
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button').length > 0).toBe(visible)
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
          <TodayAstra today={formatAPIDateInTimeZone(new Date(), mocks.profile.timeZone)} isTodaySelected suppressed={false} />
          {Array.from({ length: 50 }, (_, index) => React.createElement('HabitRow', { key: index }))}
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => String(node.type) === 'HabitRow')).toHaveLength(50)
    expect(hasText(tree, 'todayAstra.openConversation')).toBe(false)
  })
})
