import React from 'react'
import { StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import WrappedScreen from '@/app/wrapped'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'

const TestRenderer = require('react-test-renderer')
const goBackOrFallback = vi.fn()

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  parent: TestNode | null
  children: (TestNode | string)[]
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted<{
  params: Record<string, string>
  useWrapped: Mock<(...args: unknown[]) => void>
  wrapped: {
    recap: unknown
    slides: unknown[]
    isEmpty: boolean
    isLoading: boolean
    isError: boolean
  }
  safeAreaTop: number
}>(() => ({
  params: {},
  useWrapped: vi.fn(),
  wrapped: {
    recap: { id: 'recap-1' },
    slides: [] as unknown[],
    isEmpty: false,
    isLoading: false,
    isError: false,
  },
  safeAreaTop: 0,
}))

vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params }))

vi.mock('react-native-safe-area-context', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: mocks.safeAreaTop, right: 0, bottom: 0, left: 0 }),
  }
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { name: 'Ada' } }),
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => goBackOrFallback,
}))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrapped: (...args: unknown[]) => {
    mocks.useWrapped(...args)
    return { ...mocks.wrapped, refetch: vi.fn() }
  },
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }
})
vi.mock('@/components/wrapped/wrapped-player', () => ({
  WrappedPlayer: (props: Record<string, unknown>) => React.createElement('WrappedPlayer', props),
}))

function renderScreen() {
  let tree!: {
    root: TestNode
    unmount: () => void
    update: (element: React.ReactElement) => void
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<WrappedScreen />)
  })
  return tree
}

function firstByType(root: TestNode, type: unknown) {
  return root.findAll((node) => node.type === type)[0]
}

describe('WrappedScreen', () => {
  beforeEach(() => {
    goBackOrFallback.mockClear()
    mocks.params = {}
    mocks.useWrapped.mockClear()
    mocks.safeAreaTop = 0
    mocks.wrapped = {
      recap: { id: 'recap-1' },
      slides: [],
      isEmpty: false,
      isLoading: false,
      isError: false,
    }
  })

  it.each([
    { state: 'ready', recap: { id: 'recap-1' }, isEmpty: false, isLoading: false, isError: false },
    { state: 'loading', recap: null, isEmpty: false, isLoading: true, isError: false },
    { state: 'failed', recap: null, isEmpty: false, isLoading: false, isError: true },
    { state: 'empty', recap: null, isEmpty: true, isLoading: false, isError: false },
  ].flatMap((cover) => [0, 24].map((topInset) => ({ ...cover, topInset }))))(
    'reserves a back row above the $state cover with top inset $topInset',
    ({ state, topInset, ...wrappedState }) => {
      mocks.wrapped = { ...wrappedState, slides: [] }
      mocks.safeAreaTop = topInset
      const tree = renderScreen()
      const cover = firstByType(tree.root, WrappedCover)!
      expect(cover.props.state).toBe(state)
      const row = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'nav-header-back')[0]!
      expect(row).toBeTruthy()
      const exit = row.findAll((node) => node.type === 'Pressable'
        && node.props.accessibilityLabel === 'common.backToProfile')[0]!
      expect(StyleSheet.flatten(exit.props.style)).toMatchObject({ width: 44, height: 44 })
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({ height: 56 })
      const scroll = firstByType(cover, 'ScrollView')!
      expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ paddingVertical: 32, paddingHorizontal: 24 })
      expect((StyleSheet.flatten(scroll.props.contentContainerStyle) as Record<string, unknown>).paddingTop).toBeUndefined()
      const coverParent = cover.parent!
      const rowBranch = coverParent.children.find((child): child is TestNode =>
        typeof child !== 'string' && child.findAll((node) => node === row).length > 0,
      )!
      expect(coverParent.children.indexOf(rowBranch)).toBeLessThan(coverParent.children.indexOf(cover))
      for (let current: TestNode | null = row; current && current !== coverParent; current = current.parent) {
        expect((StyleSheet.flatten(current.props.style) as Record<string, unknown> | undefined)?.position).not.toBe('absolute')
      }
      expect(StyleSheet.flatten(coverParent.props.style)).toMatchObject({ paddingTop: topInset })
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')).toHaveLength(1)
      TestRenderer.act(() => tree.unmount())
    },
  )

  it('opens the player from the ready cover', () => {
    const tree = renderScreen()
    expect(firstByType(tree.root, WrappedCover)?.props.state).toBe('ready')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeTruthy()
  })

  it.each([
    { state: 'loading', recap: null, isEmpty: false, isLoading: true, isError: false },
    { state: 'failed', recap: null, isEmpty: false, isLoading: false, isError: true },
    { state: 'empty', recap: createMockRecap({ goalCompletions: 0, metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }) }), isEmpty: true, isLoading: false, isError: false },
  ])('restores cover navigation when playback becomes $state', ({ state, ...wrapped }) => {
    const tree = renderScreen()
    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onStart as () => void)()
    })
    expect(firstByType(tree.root, 'WrappedPlayer')).toBeTruthy()
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'common.backToProfile')).toHaveLength(0)

    mocks.wrapped = { ...wrapped, slides: [] }
    TestRenderer.act(() => tree.update(<WrappedScreen />))

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
    expect(firstByType(tree.root, WrappedCover)?.props.state).toBe(state)
    const back = tree.root.findAll((node) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.backToProfile',
    )
    expect(back).toHaveLength(1)
    TestRenderer.act(() => { (back[0]?.props.onPress as () => void)() })
    expect(goBackOrFallback).toHaveBeenCalledExactlyOnceWith('/profile')
    TestRenderer.act(() => tree.unmount())
  })

  it('opens a notification-carried closed month instead of the current period', () => {
    mocks.params = { period: 'month', year: '2026', month: '8' }
    const tree = renderScreen()

    expect(firstByType(tree.root, WrappedCover)?.props.period).toBe('month')
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', {
      active: false,
      closedMonth: { year: 2026, month: 8 },
    })

    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onSelectPeriod as (period: string) => void)('week')
    })

    expect(mocks.useWrapped).toHaveBeenLastCalledWith('week', {
      active: false,
      closedMonth: undefined,
    })
  })

  it('selects the next notified closed month when only the params change', () => {
    mocks.params = { period: 'month', year: '2026', month: '8' }
    const tree = renderScreen()

    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onStart as () => void)()
    })
    expect(firstByType(tree.root, 'WrappedPlayer')).toBeTruthy()

    mocks.params = { period: 'month', year: '2026', month: '9' }
    TestRenderer.act(() => {
      tree.update(<WrappedScreen />)
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
    expect(firstByType(tree.root, WrappedCover)?.props.period).toBe('month')
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', {
      active: false,
      closedMonth: { year: 2026, month: 9 },
    })
  })

  it('refuses to open the player for an empty recap', () => {
    mocks.wrapped = { ...mocks.wrapped, recap: { id: 'recap-empty' }, isEmpty: true }
    const tree = renderScreen()
    expect(firstByType(tree.root, WrappedCover)?.props.state).toBe('empty')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
  })

  it('keeps a missing paused recap non-actionable', () => {
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: false }
    const tree = renderScreen()
    expect(firstByType(tree.root, WrappedCover)?.props.state).toBe('loading')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
  })

  it('exits the cover to Profile while player close only returns to the cover', () => {
    const tree = renderScreen()
    const exit = tree.root.findAll((node) =>
      node.props.accessibilityLabel === 'common.backToProfile',
    )[0]

    TestRenderer.act(() => {
      ;(exit?.props.onPress as () => void)()
    })
    expect(goBackOrFallback).toHaveBeenCalledExactlyOnceWith('/profile')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, WrappedCover)?.props.onStart as () => void)()
    })
    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedPlayer')?.props.onClose as () => void)()
    })
    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
    expect(goBackOrFallback).toHaveBeenCalledTimes(1)
  })
})
