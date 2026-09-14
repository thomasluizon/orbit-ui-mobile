import React from 'react'
import { StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WrappedScreen from '@/app/wrapped'

const TestRenderer = require('react-test-renderer')
const goBackOrFallback = vi.fn()

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted<{
  wrapped: {
    recap: { id: string } | null
    slides: unknown[]
    isEmpty: boolean
    isLoading: boolean
    isError: boolean
  }
  safeAreaTop: number
}>(() => ({
  wrapped: {
    recap: { id: 'recap-1' },
    slides: [] as unknown[],
    isEmpty: false,
    isLoading: false,
    isError: false,
  },
  safeAreaTop: 0,
}))

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
  useWrapped: () => ({ ...mocks.wrapped, refetch: vi.fn() }),
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

function coverExitTop(root: TestNode) {
  const exitContainer = root.findAll((node) => {
    if (node.type !== 'View') return false
    const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined
    return style?.position === 'absolute' && style.left === 16 && style.zIndex === 1
  })[0]

  return (StyleSheet.flatten(exitContainer?.props.style) as Record<string, unknown> | undefined)?.top
}

describe('WrappedScreen', () => {
  beforeEach(() => {
    goBackOrFallback.mockClear()
    mocks.safeAreaTop = 0
    mocks.wrapped = {
      recap: { id: 'recap-1' },
      slides: [],
      isEmpty: false,
      isLoading: false,
      isError: false,
    }
  })

  it('positions the cover exit below a non-zero top inset', () => {
    mocks.safeAreaTop = 24
    const tree = renderScreen()

    expect(coverExitTop(tree.root)).toBe(32)
  })

  it('keeps the cover exit offset at eight when the top inset is zero', () => {
    const tree = renderScreen()

    expect(coverExitTop(tree.root)).toBe(8)
  })

  it('opens the player from the ready cover', () => {
    const tree = renderScreen()
    expect(firstByType(tree.root, 'WrappedCover')?.props.state).toBe('ready')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedCover')?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeTruthy()
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
