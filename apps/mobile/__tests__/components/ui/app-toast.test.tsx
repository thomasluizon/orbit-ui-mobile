import React from 'react'
import { StyleSheet, Text } from 'react-native'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppToast, Toast } from '@/components/ui/app-toast'
import type { ToastProps } from '@orbit/shared/contracts/feedback'
import { useAppToastStore } from '@/stores/app-toast-store'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface, withAlpha } from '@orbit/shared/__tests__/contrast'

const safeArea = vi.hoisted(() => ({ top: 0, bottom: 0, left: 0, right: 0 }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => safeArea }))

vi.mock('expo-router', () => ({ usePathname: () => '/calendar' }))

const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: theme.mode }),
}))

function render(element: React.ReactNode) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function advance(milliseconds: number) {
  TestRenderer.act(() => vi.advanceTimersByTime(milliseconds))
}

describe('mobile Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    TestRenderer.act(() => vi.runOnlyPendingTimers())
    vi.useRealTimers()
    theme.mode = 'dark'
  })

  it('removes closed action handlers before the native exit completes', () => {
    const tree = render(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} />)
    const close = tree.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'common.close')
    TestRenderer.act(() => close.props.onPress())
    expect(tree.root.findAllByType('Pressable')).toHaveLength(0)
  })

  const variants: ToastProps[] = [
    { kind: 'neutral', message: 'Feedback' },
    { kind: 'neutral', message: 'Feedback', actionLabel: 'Undo', onAction: vi.fn() },
    { kind: 'neutral', message: 'Feedback', actionLabel: 'Retry', actionIcon: 'refresh', onAction: vi.fn() },
    { kind: 'working', message: 'Feedback' },
    { kind: 'done', message: 'Feedback', onDone: vi.fn() },
    { kind: 'lost', message: 'Feedback', detail: 'Try again', actionLabel: 'Retry', onAction: vi.fn() },
  ]

  it.each(variants)('shares geometry and an accessible close target for $kind', (props) => {
    const tree = render(<Toast {...props} />)
    const surface = tree.root.findByProps({ testID: `toast-${props.kind}` })
    const style = StyleSheet.flatten(surface.props.style)
    expect(style).toMatchObject({
      width: '100%', padding: 16, borderRadius: 20, gap: 12,
    })
    for (const width of [288, 380, 704]) {
      const column = Yoga.Node.create()
      const toast = Yoga.Node.create()
      column.setWidth(width)
      toast.setWidth(style.width)
      toast.setMaxWidth(style.maxWidth)
      column.insertChild(toast, 0)
      try {
        column.calculateLayout(undefined, undefined)
        expect(toast.getComputedWidth()).toBe(width)
      } finally { column.freeRecursive() }
    }
    advance(0)
    const message = surface.findAllByType('Text').find((node: { props: { children: unknown } }) => node.props.children === 'Feedback')
    expect(StyleSheet.flatten(message.props.style)).toMatchObject({ fontSize: 14, lineHeight: 20, fontFamily: 'Geist_500Medium' })
    const close = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'common.close')[0]
    expect(close).toBeDefined()
    expect(close.props.accessibilityRole).toBe('button')
    const target = StyleSheet.flatten(close.props.style({ pressed: false }))
    expect(target.minHeight + close.props.hitSlop * 2).toBe(48)
    expect(target.width + close.props.hitSlop * 2).toBe(48)
    TestRenderer.act(() => close.props.onPress())
    expect(tree.root.findAllByProps({ testID: `toast-${props.kind}` })).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['dark', 'light'] as const)('keeps the lost action readable at rest and press in %s', (mode) => {
    theme.mode = mode
    const tree = render(
      <Toast kind="lost" message="Lost" detail="Try again" actionLabel="Retry" onAction={() => {}} />,
    )
    const action = tree.root.findByProps({ testID: 'toast-action' })
    const tokens = createTokensV2('purple', mode)

    for (const pressed of [false, true]) {
      if (pressed) TestRenderer.act(() => action.props.onPressIn?.())
      const foreground = StyleSheet.flatten(action.findByType('Text').props.style).color as string
      const actionStyle = typeof action.props.style === 'function'
        ? action.props.style({ pressed })
        : action.props.style
      const opacity = StyleSheet.flatten(actionStyle).opacity ?? 1
      expect(contrastOnSurface(withAlpha(foreground, opacity), [tokens.bg]))
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['dark', 'light'] as const)('keeps the neutral action readable at rest and press in %s', (mode) => {
    theme.mode = mode
    const tree = render(<Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={() => {}} />)
    const action = tree.root.findByProps({ testID: 'toast-action' })
    const tokens = createTokensV2('purple', mode)

    for (const pressed of [false, true]) {
      if (pressed) TestRenderer.act(() => action.props.onPressIn())
      const foreground = StyleSheet.flatten(action.findByType('Text').props.style).color as string
      expect(contrastOnSurface(foreground, [tokens.bgSheet])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['dark', 'light'] as const)('shows a high-contrast action focus ring in %s', (mode) => {
    theme.mode = mode
    const tree = render(
      <Toast kind="lost" message="Lost" detail="Try again" actionLabel="Retry" onAction={() => {}} />,
    )
    const action = tree.root.findByProps({ testID: 'toast-action' })
    const tokens = createTokensV2('purple', mode)

    TestRenderer.act(() => action.props.onFocus())
    const focusedStyle = StyleSheet.flatten(action.props.style)
    expect(focusedStyle.outlineWidth).toBeGreaterThanOrEqual(2)
    expect(contrastOnSurface(focusedStyle.outlineColor, [tokens.bg])).toBeGreaterThanOrEqual(3)
  })

  it('expands even a one-character action to a 48px target without reaching the copy', () => {
    const tree = render(
      <Toast kind="lost" message="Lost" detail="Try again" actionLabel="i" onAction={() => {}} />,
    )
    const action = tree.root.findByProps({ testID: 'toast-action' })
    const actionStyle = StyleSheet.flatten(
      typeof action.props.style === 'function' ? action.props.style({ pressed: false }) : action.props.style,
    )
    const toastStyle = StyleSheet.flatten(tree.root.findByProps({ testID: 'toast-lost' }).props.style)

    expect(actionStyle.minWidth + (action.props.hitSlop ?? 0) * 2).toBeGreaterThanOrEqual(48)
    expect(actionStyle.minHeight + (action.props.hitSlop ?? 0) * 2).toBeGreaterThanOrEqual(48)
    expect(toastStyle.gap).toBeGreaterThanOrEqual(action.props.hitSlop ?? 0)
    expect(toastStyle.padding).toBeGreaterThanOrEqual(action.props.hitSlop ?? 0)
  })

  it.each([48, 112, 200])('keeps the public route height unchanged with a %ipx toast', (toastHeight) => {
    useAppToastStore.setState({ currentToast: null, queue: [] })
    const tree = render(<AppToast />)
    const root = Yoga.Node.create()
    const route = Yoga.Node.create()
    root.setWidth(412)
    root.setHeight(820)
    route.setFlex(1)
    root.insertChild(route, 0)
    root.calculateLayout(undefined, undefined)
    const heightWithoutToast = route.getComputedHeight()
    TestRenderer.act(() => { useAppToastStore.getState().showInfo('Feedback') })
    const hostStyle = StyleSheet.flatten(tree.root.findByProps({ pointerEvents: 'box-none' }).props.style)
    expect(hostStyle).toMatchObject({ bottom: 16, left: 0, position: 'absolute', width: 412 })
    const host = Yoga.Node.create()
    const content = Yoga.Node.create()
    content.setHeight(toastHeight)
    host.insertChild(content, 0)
    host.setPadding(Yoga.EDGE_ALL, hostStyle.padding)
    host.setPositionType(hostStyle.position === 'absolute' ? Yoga.POSITION_TYPE_ABSOLUTE : Yoga.POSITION_TYPE_RELATIVE)
    root.insertChild(host, 1)
    try {
      root.calculateLayout(undefined, undefined)
      expect(route.getComputedHeight()).toBe(heightWithoutToast)
      expect(route.getComputedHeight()).toBe(820)
    } finally {
      root.freeRecursive()
      TestRenderer.act(() => tree.unmount())
    }
  })

  it('calls onDone once at the default 5000ms and never before', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" onDone={onDone} />)

    advance(4999)
    expect(onDone).not.toHaveBeenCalled()
    advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    advance(25000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('clamps a short done life to 5000ms', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" doneAfterMs={2000} onDone={onDone} />)

    advance(2000)
    expect(onDone).not.toHaveBeenCalled()
    advance(3000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('honors an 8000ms life exactly once', () => {
    const onDone = vi.fn()
    render(<Toast kind="done" message="Saved" doneAfterMs={8000} onDone={onDone} />)

    advance(7999)
    expect(onDone).not.toHaveBeenCalled()
    advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    advance(22000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pauses on hover and resumes when the pointer leaves', () => {
    const onDone = vi.fn()
    const tree = render(<Toast kind="done" message="Saved" onDone={onDone} />)
    const toast = tree.root.findByProps({ testID: 'toast-done' })

    advance(1000)
    TestRenderer.act(() => toast.props.onPointerEnter())
    advance(30000)
    expect(onDone).not.toHaveBeenCalled()
    TestRenderer.act(() => toast.props.onPointerLeave())
    advance(4000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pauses on focus and resumes on blur', () => {
    const onDone = vi.fn()
    const tree = render(<Toast kind="done" message="Saved" onDone={onDone} />)
    const toast = tree.root.findByProps({ testID: 'toast-done' })

    TestRenderer.act(() => toast.props.onFocus())
    advance(30000)
    expect(onDone).not.toHaveBeenCalled()
    TestRenderer.act(() => toast.props.onBlur())
    advance(5000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('runs a neutral life that pauses while the pointer rests on it', () => {
    const onDone = vi.fn()
    const tree = render(
      <Toast
        kind="neutral"
        message="Couldn't delete that alert. Try again."
        actionLabel="Retry"
        onAction={vi.fn()}
        doneAfterMs={10000}
        onDone={onDone}
      />,
    )
    const toast = tree.root.findByProps({ testID: 'toast-neutral' })

    advance(1000)
    TestRenderer.act(() => toast.props.onPointerEnter())
    advance(30000)
    expect(onDone).not.toHaveBeenCalled()
    TestRenderer.act(() => toast.props.onPointerLeave())
    advance(9000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('holds a neutral life while focus sits inside it', () => {
    const onDone = vi.fn()
    const tree = render(
      <Toast
        kind="neutral"
        message="Couldn't delete that alert. Try again."
        actionLabel="Retry"
        onAction={vi.fn()}
        doneAfterMs={10000}
        onDone={onDone}
      />,
    )
    const toast = tree.root.findByProps({ testID: 'toast-neutral' })

    TestRenderer.act(() => toast.props.onFocus())
    advance(30000)
    expect(onDone).not.toHaveBeenCalled()
    TestRenderer.act(() => toast.props.onBlur())
    advance(10000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps the lost action available before its timeout', () => {
    const onAction = vi.fn()
    const tree = render(
      <Toast
        kind="lost"
        message="The change was lost."
        detail="Do it again."
        actionLabel="Retry"
        onAction={onAction}
      />,
    )
    advance(0)
    advance(4999)

    expect(tree.root.findByProps({ testID: 'toast-lost' })).toBeTruthy()
    const action = tree.root.findByProps({ testID: 'toast-action' })
    TestRenderer.act(() => action.props.onPress())
    TestRenderer.act(() => action.props.onPress())
    expect(onAction).toHaveBeenCalledTimes(2)
  })

  it('calls a neutral action and does nothing when its host removes it', () => {
    const onAction = vi.fn()
    const tree = render(
      <Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={onAction} />,
    )
    const action = tree.root.findByProps({ testID: 'toast-action' })
    TestRenderer.act(() => action.props.onPress())
    expect(onAction).toHaveBeenCalledTimes(1)

    const untouched = vi.fn()
    const removed = render(
      <Toast kind="neutral" message="Queued" actionLabel="Undo" onAction={untouched} />,
    )
    TestRenderer.act(() => removed.unmount())
    expect(untouched).not.toHaveBeenCalled()
  })

  it('draws the working mark itself and no icon element', () => {
    const tree = render(<Toast kind="working" message="Saving" />)

    expect(tree.root.findByProps({ testID: 'toast-working-mark' })).toBeTruthy()
    expect(tree.root.findAllByProps({ testID: 'caller-icon' })).toHaveLength(0)
  })

  it('announces neutral, working, and done politely, and lost assertively', () => {
    const neutral = render(<Toast kind="neutral" message="Fact" />)
    expect(neutral.root.findByProps({ testID: 'toast-neutral' }).props.accessibilityLiveRegion).toBe('polite')
    const working = render(<Toast kind="working" message="Working" />)
    expect(working.root.findByProps({ testID: 'toast-working' }).props.accessibilityLiveRegion).toBe('polite')
    const done = render(<Toast kind="done" message="Done" onDone={() => {}} />)
    expect(done.root.findByProps({ testID: 'toast-done' }).props.accessibilityLiveRegion).toBe('polite')
    const lost = render(
      <Toast kind="lost" message="Lost" detail="Retry" actionLabel="Retry" onAction={() => {}} />,
    )
    expect(lost.root.findByProps({ testID: 'toast-lost' }).props.accessibilityLiveRegion).toBe('assertive')
  })

  it('never asks for focus when any kind mounts', () => {
    const neutral = render(<Toast kind="neutral" message="Fact" />)
    const working = render(<Toast kind="working" message="Working" />)
    const done = render(<Toast kind="done" message="Done" onDone={() => {}} />)
    const lost = render(
      <Toast kind="lost" message="Lost" detail="Retry" actionLabel="Retry" onAction={() => {}} />,
    )

    for (const [tree, id] of [
      [neutral, 'toast-neutral'],
      [working, 'toast-working'],
      [done, 'toast-done'],
      [lost, 'toast-lost'],
    ] as const) {
      expect(tree.root.findByProps({ testID: id }).props.focusable).toBe(false)
    }
  })

  it('mounts the live region empty before writing its message', () => {
    const tree = render(<Toast kind="neutral" message="Fact" />)
    const toast = tree.root.findByProps({ testID: 'toast-neutral' })

    expect(toast.props.accessibilityLabel).toBe('')
    advance(0)
    expect(tree.root.findByProps({ testID: 'toast-neutral' }).props.accessibilityLabel).toBe('Fact')
  })

  it('draws completion with statusDone and not the accent', () => {
    const tree = render(<Toast kind="done" message="Saved" onDone={() => {}} />)
    const mark = tree.root.findByProps({ testID: 'toast-done-mark' })
    const tokens = createTokensV2('purple', 'dark')
    const style = mark.props.style.flat()

    expect(style).toContainEqual(expect.objectContaining({ backgroundColor: tokens.statusDone }))
    expect(style).not.toContainEqual(expect.objectContaining({ backgroundColor: tokens.primary }))
  })

  it('accepts a neutral icon but working has no icon slot', () => {
    const neutral = render(
      <Toast kind="neutral" message="Fact" icon={<Text testID="caller-icon">icon</Text>} />,
    )
    expect(neutral.root.findByProps({ testID: 'caller-icon' })).toBeTruthy()
    const working = render(<Toast kind="working" message="Working" />)
    expect(working.root.findAllByProps({ testID: 'caller-icon' })).toHaveLength(0)
  })
})

it('keeps the overlay toast inside side insets plus its existing gutter', () => {
  safeArea.left = 28
  safeArea.right = 64
  useAppToastStore.setState({ currentToast: null, queue: [] })
  const tree = render(<AppToast />)
  try {
    TestRenderer.act(() => { useAppToastStore.getState().showInfo('Feedback') })
    const style = StyleSheet.flatten(tree.root.findByProps({ pointerEvents: 'box-none' }).props.style)
    expect(style.left).toBe(0)
    expect(style.width).toBe(412)
    const content = StyleSheet.flatten(tree.root.findByProps({ testID: 'toast-content-frame' }).props.style)
    expect(content.left).toBe(28 + 16)
    expect(content.left + content.width).toBe(412 - 64 - 16)
  } finally {
    safeArea.left = 0
    safeArea.right = 0
    TestRenderer.act(() => tree.unmount())
    useAppToastStore.setState({ currentToast: null, queue: [] })
  }
})
