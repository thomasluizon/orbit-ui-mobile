import React from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import WrappedScreen from '@/app/wrapped'

const TestRenderer = require('react-test-renderer')
const goBackOrFallback = vi.fn()

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted<{
  params: Record<string, string>
  useWrapped: Mock<(...args: unknown[]) => void>
  wrapped: {
    recap: { id: string } | null
    slides: unknown[]
    isEmpty: boolean
    isLoading: boolean
    isError: boolean
  }
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
}))

vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params }))

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
vi.mock('@/components/wrapped/wrapped-cover', () => ({
  WrappedCover: (props: Record<string, unknown>) => React.createElement('WrappedCover', props),
}))
vi.mock('@/components/wrapped/wrapped-player', () => ({
  WrappedPlayer: (props: Record<string, unknown>) => React.createElement('WrappedPlayer', props),
}))

function renderScreen() {
  let tree!: { root: TestNode; unmount: () => void }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<WrappedScreen />)
  })
  return tree
}

function firstByType(root: TestNode, type: string) {
  return root.findAll((node) => node.type === type)[0]
}

describe('WrappedScreen', () => {
  beforeEach(() => {
    goBackOrFallback.mockClear()
    mocks.params = {}
    mocks.useWrapped.mockClear()
    mocks.wrapped = {
      recap: { id: 'recap-1' },
      slides: [],
      isEmpty: false,
      isLoading: false,
      isError: false,
    }
  })

  it('opens the player from the ready cover', () => {
    const tree = renderScreen()
    expect(firstByType(tree.root, 'WrappedCover')?.props.state).toBe('ready')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedCover')?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeTruthy()
  })

  it('opens a notification-carried closed month instead of the current period', () => {
    mocks.params = { period: 'month', year: '2026', month: '8' }
    const tree = renderScreen()

    expect(firstByType(tree.root, 'WrappedCover')?.props.period).toBe('month')
    expect(mocks.useWrapped).toHaveBeenLastCalledWith('month', {
      active: false,
      closedMonth: { year: 2026, month: 8 },
    })
  })

  it('refuses to open the player for an empty recap', () => {
    mocks.wrapped = { ...mocks.wrapped, recap: { id: 'recap-empty' }, isEmpty: true }
    const tree = renderScreen()
    expect(firstByType(tree.root, 'WrappedCover')?.props.state).toBe('empty')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedCover')?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
  })

  it('keeps a missing paused recap non-actionable', () => {
    mocks.wrapped = { recap: null, slides: [], isEmpty: false, isLoading: false, isError: false }
    const tree = renderScreen()
    expect(firstByType(tree.root, 'WrappedCover')?.props.state).toBe('loading')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedCover')?.props.onStart as () => void)()
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
      ;(firstByType(tree.root, 'WrappedCover')?.props.onStart as () => void)()
    })
    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedPlayer')?.props.onClose as () => void)()
    })
    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
    expect(goBackOrFallback).toHaveBeenCalledTimes(1)
  })
})
