import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WrappedScreen from '@/app/wrapped'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  wrapped: {
    recap: { id: 'recap-1' },
    slides: [] as unknown[],
    isEmpty: false,
    isLoading: false,
    isError: false,
  },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { name: 'Ada' } }),
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

describe('WrappedScreen', () => {
  beforeEach(() => {
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

  it('refuses to open the player for an empty recap', () => {
    mocks.wrapped = { ...mocks.wrapped, recap: { id: 'recap-empty' }, isEmpty: true }
    const tree = renderScreen()
    expect(firstByType(tree.root, 'WrappedCover')?.props.state).toBe('empty')

    TestRenderer.act(() => {
      ;(firstByType(tree.root, 'WrappedCover')?.props.onStart as () => void)()
    })

    expect(firstByType(tree.root, 'WrappedPlayer')).toBeUndefined()
  })
})
