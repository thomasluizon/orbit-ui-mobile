import { describe, expect, it, vi, beforeEach } from 'vitest'

import { StreakBadge } from '@/components/gamification/streak-badge'

const TestRenderer = require('react-test-renderer')

const pushMock = vi.fn()

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`
      return key
    },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'graphite', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => ({
      statusFrozen: '#88ccff',
      statusBad: '#ff5555',
      fg1: '#ffffff',
      fg3: '#999999',
      hairlineStrong: '#333333',
    }),
  }
})

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

function findButton(root: any) {
  return root.findAll(
    (node: any) =>
      node.props &&
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      typeof node.type !== 'string',
  )
}

function renderBadge(props: { streak: number; isFrozen?: boolean }) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<StreakBadge {...props} />)
  })
  return tree
}

describe('StreakBadge (mobile)', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders nothing when streak is 0', () => {
    const tree = renderBadge({ streak: 0 })
    expect(tree.toJSON()).toBeNull()
  })

  it('renders nothing when streak is negative', () => {
    const tree = renderBadge({ streak: -1 })
    expect(tree.toJSON()).toBeNull()
  })

  it('renders the badge as a button with an accessible label', () => {
    const tree = renderBadge({ streak: 3 })
    const [button] = findButton(tree.root)
    expect(button).toBeTruthy()
    expect(typeof button.props.accessibilityLabel).toBe('string')
  })

  it('navigates to the streak page on press', () => {
    const tree = renderBadge({ streak: 5 })
    const [button] = findButton(tree.root)
    TestRenderer.act(() => {
      button?.props.onPress?.({ stopPropagation: () => {} })
    })
    expect(pushMock).toHaveBeenCalledWith('/streak')
  })

  it('stops propagation so the header go-to-today does not fire', () => {
    const tree = renderBadge({ streak: 5 })
    const [button] = findButton(tree.root)
    const stopPropagation = vi.fn()
    TestRenderer.act(() => {
      button?.props.onPress?.({ stopPropagation })
    })
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })
})
