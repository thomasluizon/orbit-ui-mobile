import { describe, expect, it, vi, beforeEach } from 'vitest'

import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

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

const themeState = vi.hoisted(() => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: themeState.mode }),
}))

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
    themeState.mode = 'dark'
  })

  it('stays visible at streak 0 and still routes to Progresso', () => {
    const tree = renderBadge({ streak: 0 })
    const [button] = findButton(tree.root)
    expect(button).toBeTruthy()
    TestRenderer.act(() => {
      button?.props.onPress?.({ stopPropagation: () => {} })
    })
    expect(pushMock).toHaveBeenCalledWith('/progress')
  })

  it('renders the badge as a button with an accessible label', () => {
    const tree = renderBadge({ streak: 3 })
    const [button] = findButton(tree.root)
    expect(button).toBeTruthy()
    expect(typeof button.props.accessibilityLabel).toBe('string')
  })

  it('navigates to Progresso on press', () => {
    const tree = renderBadge({ streak: 5 })
    const [button] = findButton(tree.root)
    TestRenderer.act(() => {
      button?.props.onPress?.({ stopPropagation: () => {} })
    })
    expect(pushMock).toHaveBeenCalledWith('/progress')
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


describe('StreakBadge pressed paint', () => {
  it.each([
    { mode: 'dark', streak: 0, isFrozen: false },
    { mode: 'light', streak: 0, isFrozen: false },
    { mode: 'dark', streak: 5, isFrozen: false },
    { mode: 'light', streak: 5, isFrozen: false },
    { mode: 'dark', streak: 0, isFrozen: true },
    { mode: 'light', streak: 0, isFrozen: true },
  ] as const)('layers feedback in $mode at streak $streak with frozen=$isFrozen', ({ mode, streak, isFrozen }) => {
    themeState.mode = mode
    const tokens = createTokensV2('orange', mode)
    const tree = renderBadge({ streak, isFrozen })
    const [button] = findButton(tree.root)
    const rest = StyleSheet.flatten(button.props.style({ pressed: false }))
    const pressed = StyleSheet.flatten(button.props.style({ pressed: true }))
    expect(pressed.backgroundColor).toBe(rest.backgroundColor)
    expect(typeof button.props.children).toBe('function')
    const restingContents = button.props.children({ pressed: false })
    const [restingLayer, restingGlyph, restingCount] = restingContents.props.children
    expect(StyleSheet.flatten(restingLayer.props.style).backgroundColor).toBe('transparent')
    expect(StyleSheet.flatten(restingCount.props.style).color).toBe(streak === 0 && !isFrozen ? tokens.fg3 : tokens.fg1)
    const contents = button.props.children({ pressed: true })
    const [layer, , count] = contents.props.children
    const fill = StyleSheet.flatten(layer.props.style).backgroundColor
    const text = StyleSheet.flatten(count.props.style).color
    expect(fill).toBe(tokens.bgHoverOpaque)
    expect(text).toBe(streak === 0 && !isFrozen ? tokens.fg2 : tokens.fg1)
    expect(layer.props.pointerEvents).toBe('none')
    if (isFrozen) {
      expect(restingGlyph.props.children).toHaveLength(6)
      expect(restingGlyph.props.children.every((line: { props: { stroke: string } }) => line.props.stroke === tokens.fg2)).toBe(true)
    } else {
      expect(restingGlyph.props.children).toBe('🔥')
    }
    expect(contrastOnSurface(tokens.bgElev, [tokens.bgElev, fill])).toBeGreaterThanOrEqual(1.25)
    expect(contrastOnSurface(text, [tokens.bgElev, fill])).toBeGreaterThanOrEqual(4.5)
    TestRenderer.act(() => tree.unmount())
  })
})
